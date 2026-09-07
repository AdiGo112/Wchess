# WChess — Core Algorithms

> Every algorithm this platform uses — now or later, directly or through a dependency.
> Each gives **Why** it exists, **How** it works, and **Where** it lives (file · symbol).
> Verified against source / feature ADRs on 2026-07-24.
>
> **Three tiers:**
> - **A — Implemented now.** Live in the codebase today.
> - **B — Planned (we implement).** Specified in a feature ADR; we write the code later.
> - **C — Relied on indirectly.** Runs inside a dependency we already use (engine, crypto,
>   data structures); we don't write it, but the platform's behaviour depends on it.

---

# Tier A — Implemented now

| # | Algorithm | Where |
|---|-----------|-------|
| 1 | Glicko-2 rating update | `backend/src/common/utils/elo.ts` · `updateGlicko2()` |
| 2 | Variant classification | `backend/src/common/utils/elo.ts` · `variantFromTimeControl()` |
| 3 | Server-authoritative clock (deadline sweeper) | `backend/src/games/game.gateway.ts` · `sweep()` + `games.service.ts` · `setDeadline()` |
| 4 | Optimistic concurrency (CAS via Lua) | `backend/src/games/games.service.ts` · `CAS_SCRIPT`, `casSaveRoom()` |
| 5 | Fischer clock decrement + increment | `backend/src/games/game.gateway.ts` · `handleMove()` |
| 6 | Rating-tolerance relaxation (matchmaking) | `backend/src/matchmaking/matchmaking.service.ts` · `toleranceForWait()`, `poll()` |
| 7 | Atomic pairing claim | `backend/src/matchmaking/matchmaking.service.ts` · `pairAndNotify()` |
| 8 | Leaderboard: sorted sets + period buckets | `backend/src/leaderboard/leaderboard.service.ts` |
| 9 | TOCTOU-safe challenge accept | `backend/src/matchmaking/matchmaking.service.ts` · `acceptChallenge()` |
| 10 | bcrypt password hashing | `backend/src/auth/auth.service.ts` |
| 11 | JWT access + rotating hashed refresh tokens | `backend/src/auth/auth.service.ts` · `login()`, `refresh()` |
| 12 | Stockfish difficulty mapping (WASM) | `frontend/src/hooks/useStockfish.ts` |
| 12a | Depth-18 post-game engine sweep (server) | `backend/src/analysis/analysis.service.ts` · `sweep()` |
| 12b | Move classification (clamped centipawn loss) | `backend/src/analysis/classify.ts` · `classify()` |
| 12c | Win% + accuracy curves | `backend/src/analysis/classify.ts` · `winPercent()`, `moveAccuracy()` |

---

## 1. Glicko-2 rating update

**Why.** Plain Elo gives a single number with no notion of *confidence* — it mis-ranks new
and returning players and produces lopsided pairings. Glicko-2 models each player as
`(rating, rating-deviation RD, volatility σ)`, so a result against an uncertain opponent
moves the rating less, and inactivity widens RD. This keeps rankings and matchmaking fair.

**How.** A line-for-line implementation of Glickman's reference note (`updateGlicko2`):
1. Convert to the internal scale: `μ = (r-1500)/173.7178`, `φ = RD/173.7178`.
2. Compute `g(φ) = 1/√(1 + 3φ²/π²)` and expected score `E = 1/(1+e^(−g·(μ−μ_j)))`.
3. Estimated variance `v = 1 / (g² · E · (1−E))`, improvement `Δ = v · g · (score−E)`.
4. **Solve new volatility** σ′ by root-finding on `f(x)` with the **Illinois algorithm**
   (regula falsi variant), constants `τ = 0.5`, `ε = 1e-6`, ≤100 iterations.
5. Recombine: `φ* = √(φ²+σ′²)`, `φ′ = 1/√(1/φ*² + 1/v)`, `μ′ = μ + φ′²·g·(score−E)`.
6. Convert back; clamp `RD ∈ [30, 350]`.

**Where.** `elo.ts · updateGlicko2()`. Called on every rated game end from
`games.service.ts · endGame()` (lines ~194–195), once per player, with `score ∈ {1, 0.5, 0}`.
New ratings feed both the PostgreSQL `UserRating` row and the Redis leaderboard.

---

## 2. Variant classification from time control

**Why.** Ratings are tracked per speed category (Bullet/Blitz/Rapid/Classical); the same
player has four independent ratings. The category must be derived deterministically so a
challenge and its scored game can never disagree.

**How.** Pure threshold function on base seconds: `< 180 → BULLET`, `< 600 → BLITZ`,
`< 1800 → RAPID`, else `CLASSICAL`.

**Where.** `elo.ts · variantFromTimeControl()`. Used by games, matchmaking, and challenge
creation so the variant is single-sourced.

---

## 3. Server-authoritative clock — Redis-ZSET deadline sweeper (ADR-0004)

**Why.** Clients cannot be trusted to time themselves (cheating, lag, tab-sleep). The server
must own every clock, decide flag-fall, and survive a restart mid-game. A naive
`setInterval` *per game* doesn't survive a restart and doesn't scale.

**How.**
- One Redis sorted set `clock:deadlines` maps `roomId → epoch-ms deadline`, where
  `deadline = lastMoveAt + timers[sideToMove] + 500ms grace` (`setDeadline()`). Every move
  re-arms it; game end clears it.
- A **single** 1-second `setInterval` sweep (`sweep()`) scans all watched rooms:
  - `remaining = timers[side] − (now − lastMoveAt)`.
  - If `remaining ≤ −500ms` (grace absorbs network jitter) → **flag-fall**: atomically claim
    the room to `ended` and finish it as a `TIMEOUT` for the side to move.
  - Otherwise push a `clock_sync` event so clients correct their local interpolation.
- Deadlines live in Redis, so the sweeper is stateless and restart-safe.

**Where.** `game.gateway.ts · sweep()`; deadline helpers in `games.service.ts`
(`setDeadline`, `clearDeadline`, `expiredDeadlines`, `watchedRooms`). Grace = `CLOCK_GRACE_MS = 500`.

---

## 4. Optimistic concurrency — compare-and-set via Lua (room versioning)

**Why.** Several events can mutate the same game room *simultaneously* — a move, the clock
sweeper, a resign, a draw accept. Last-write-wins would corrupt state or double-end a game.
We need **exactly one winner** per conflicting write, without a global lock.

**How.** Each `ActiveRoom` carries a `version` integer. `casSaveRoom()` runs a Lua script
atomically on Redis:
```
GET room → cjson.decode → if stored.version != expected then return 0
else SET room (with EX ttl); return 1
```
On success the in-memory version is bumped; on conflict (`0`) the caller re-reads and
**retries its whole read-modify-write** up to `CAS_RETRIES = 3` times. Missing key counts as
a conflict (room was deleted). This is optimistic locking: no lock held, contention just costs
a retry.

**Where.** `games.service.ts · CAS_SCRIPT`, `casSaveRoom()`. Every mutating gateway handler
(`handleMove`, `handleOfferDraw`, `handleResign`, `handleRematchRequest`, `handleComputerMove`,
`claimEnd`, …) writes through it and retries on `false`.

---

## 5. Fischer clock decrement + increment (per move)

**Why.** A move must debit the mover's elapsed time and, for increment time controls, credit
the bonus — server-side, matching the sweeper's arithmetic exactly so the two never disagree.

**How.** In `handleMove` (server, after validating the move):
```
raw = timers[color] − (now − lastMoveAt)
if raw ≤ −grace  → flag-fall (end as timeout)
else timers[color] = max(0, raw) + increment*1000
     lastMoveAt = now
```
Then the deadline for the side now to move is re-armed (§3).

**Where.** `game.gateway.ts · handleMove()` (~lines 288–318); same pattern for the computer's
move in `handleComputerMove()`.

---

## 6. Rating-tolerance relaxation — matchmaking pairing (ADR-0008)

**Why.** Pair players of similar strength, but never make someone wait forever. Early on,
insist on a close rating; the longer they wait, the wider the acceptable gap.

**How.**
- Queues are Redis lists keyed `queue:{variant}:{timeControl}`; a service-owned timer polls
  every **500 ms** (`poll()`).
- Tolerance widens with wait: `tolerance = min(50 + waitSeconds·12, 400)` (`toleranceForWait()`)
  — starts at ±50, grows 12/sec, caps at ±400 (~29 s).
- Each sweep: parse entries, **sort by `enqueuedAt`** (longest-waiting first), then for each
  pair `(i, j)` accept if `|ratingᵢ − ratingⱼ| ≤ min(tolᵢ, tolⱼ)` — the *stricter* of the two
  players' tolerances must hold. First accepted pair per queue is matched.

**Where.** `matchmaking.service.ts · toleranceForWait()`, `poll()`. Constants:
`BASE_TOLERANCE=50`, `TOLERANCE_PER_SEC=12`, `MAX_TOLERANCE=400`, `POLL_INTERVAL_MS=500`.
A single-queue invariant (`enqueue → leaveAllQueues`) guarantees a player is in at most one queue.

---

## 7. Atomic pairing claim

**Why.** Two poll cycles (or two candidates) must never both consume the same queued player,
or one player ends up in two games.

**How.** `pairAndNotify()` claims each entry with `LREM key 1 <exact-payload>` (removes one
occurrence, returns count). If the first claim fails, abort. If the second fails, the partner
vanished mid-pair → `LPUSH` the first player back so they keep waiting. If room creation throws
after both were pulled, re-queue **both**. Colours assigned by coin flip.

**Where.** `matchmaking.service.ts · pairAndNotify()`.

---

## 8. Leaderboard — Redis sorted sets + self-expiring period buckets

**Why.** Ranking millions of scores needs O(log n) insert and O(log n + k) top-k reads —
exactly what a Redis sorted set (skip list) gives. Time-scoped boards (week/month) must appear
and disappear on their own without a cron.

**How.**
- On each rated game end, `updateScore()` does `ZADD` into three boards: all-time
  `leaderboard:{variant}`, current-week `leaderboard:week:{ISO-week}:{variant}`, current-month
  `leaderboard:month:{YYYY-MM}:{variant}`.
- **Period buckets self-expire**: TTL re-armed on every write (week 14 d, month 62 d), so an
  active bucket never lapses under load but a finished one expires ~TTL after its last game.
- Reads: top-N via `ZREVRANGE … WITHSCORES`; a player's own rank via `ZREVRANK` (+1). Enriched
  top-N (usernames/avatars joined from PostgreSQL) is cached in Redis for **60 s** to avoid
  re-hitting Postgres.
- ISO-week key uses the Thursday-of-week rule so year boundaries are correct.

**Where.** `leaderboard.service.ts` — `updateScore`, `getTopPlayers`, `getUserRank`, `isoWeek`,
`boardKey`. `seedFromDatabase()` rebuilds boards from `UserRating`.

---

## 9. TOCTOU-safe challenge acceptance

**Why.** A shared challenge link could be accepted by two people at once; only one game may be
created, and a user must not accept their own or a used/expired challenge.

**How.** After cheap guards (not-found → 404, expired → 404, already-accepted → 409, own → 403),
the accept is claimed atomically with a conditional update:
`updateMany({ where: { token, status: 'pending' }, data: { status: 'accepted' } })`. Only the
request whose `count === 1` proceeds to create the room; the loser gets 409. If room creation
then fails, the claim is released back to `pending` so the link works again.

**Where.** `matchmaking.service.ts · acceptChallenge()`.

---

## 10. bcrypt password hashing

**Why.** Passwords must be stored as a slow, salted, *cost-adjustable* hash so a database leak
doesn't expose them and the work factor can rise with hardware.

**How.** `bcrypt.hash(password, 10)` on register (cost factor 10, salt built in);
`bcrypt.compare()` in `validateUser()` on login; banned users are rejected post-compare.

**Where.** `auth.service.ts · register()`, `validateUser()` (`bcryptjs`).

---

## 11. JWT access + rotating, hashed refresh tokens

**Why.** A JWT is stateless — fast to verify but **impossible to revoke** before it expires.
The fix: short-lived access tokens bound the damage window, and refresh tokens are stored
server-side (so they *can* be revoked) and rotated on every use (so a stolen one is detectable
by breakage / single-use).

**How.**
- `login()`: sign a JWT `{ sub, username, role }`; generate a **64-byte random** refresh token,
  store only its **SHA-256 hash** in the `RefreshToken` table (raw value never persisted).
- `refresh()`: hash the presented token, then in a single DB **transaction** — look it up,
  reject if missing/expired, reject if user missing/banned, **delete the old row and create a
  new one** (rotation), and issue a fresh JWT. P2025 on delete → a concurrent request already
  consumed it → 401.
- `logout()`: `deleteMany` all refresh tokens for the user (idempotent).

**Where.** `auth.service.ts · login()`, `refresh()`, `logoutByRefreshToken()`. Access-token
verification is handled by `jwt.strategy.ts` (Passport-JWT).

---

## 12. Stockfish difficulty mapping (in-browser WASM, ADR-0009)

**Why.** The AI opponent runs as WebAssembly **in the player's own browser**, so computer games
cost the server no CPU (it scales for free). Five difficulty levels must feel distinct.

**How.** Difficulty `1–5` maps to two UCI knobs at once (`LEVELS` table): engine
`Skill Level 0→20` **and** think time `movetime 200→1500 ms`. Both matter — a strong engine
still finds good moves given time, so weak levels also think less. The 7.3 MB
`stockfish-18-lite-single` worker is created lazily (only when a computer game is active),
driven over the UCI protocol (`uci`, `setoption`, `position fen`, `go movetime`), and the
`bestmove` line is parsed into `{from, to, promotion}`. The server still re-validates the
resulting move (chess.js) before applying it.

**Where.** `frontend/src/hooks/useStockfish.ts` · `useStockfish()`, `getBestMove()`.

---

# Tier B — Planned (we implement later)

Each is specified in a feature ADR; the code is deferred, not the design.

| # | Algorithm | Spec | Planned location |
|---|-----------|------|------------------|
| 13 | Swiss pairing | ADR-0015 | `tournaments` · `pairRound()` |
| 14 | Buchholz tiebreak | ADR-0015 | `tournaments` · standings sort |
| 15 | Round-Robin scheduling (circle method) | ADR-0015 | `tournaments` |
| 16 | Knockout bracket seeding | ADR-0015 | `tournaments` |
| 17 | Arena continuous pairing | ADR-0015 | `tournaments` |
| 18 | SM-2 spaced repetition | ADR-0019 | `puzzles` · `SpacedRepetitionService.calculateNextReview()` |
| 19 | Glicko-2 puzzle ratings | ADR-0020 | reuses Tier A #1 `updateGlicko2()` |
| 20 | ~~Move classification (centipawn loss)~~ | ADR-0027 | **Shipped** — Tier A #12b, in `analysis/classify.ts`, not `utils/move-classifier.ts` |
| 21 | Brilliant-move sacrifice heuristic | ADR-0027 | `utils/move-classifier.ts` |
| 22 | ECO opening identification | ADR-0028 | `analysis` · prefix match |
| 23 | ~~Depth-18 engine analysis (server)~~ | ADR-0010/0026 | **Shipped** — Tier A #12a. Child process over UCI, not a BullMQ job; ADR-0010 superseded |
| 24 | Redis-TTL online presence | ADR-0022 | `social` · `PresenceService` |
| 25 | BullMQ delayed-job scheduling | ADR-0016 | `tournaments` round-advancement cron |

### 13. Swiss pairing
**Why.** Default tournament format — everyone keeps playing (no early elimination), scales to
hundreds, ranks fairly in `ceil(log2 N)` rounds. **How.** Each round, sort players into score
groups and pair within a group; avoid rematches via backtracking; give a bye to the odd player
out. Designed as a pure function `pairRound(players, previousGames) → pairs` so a stronger
implementation (max-weight matching / Monrad) can drop in without touching the module.
**Where.** `tournaments` service (ADR-0015).

### 14. Buchholz tiebreak
**Why.** Equal scores need a deterministic order; Buchholz is the FIDE-standard Swiss tiebreak.
**How.** A player's tiebreak = sum of their opponents' final scores (strength of schedule);
higher wins. **Where.** Tournament standings sort (ADR-0015).

### 15–17. Round-Robin / Knockout / Arena
**Why.** The three non-default formats, offered explicitly. **How.** Round-Robin: circle
(Berger) method schedules `N·(N−1)/2` games, rotating a fixed anchor. Knockout: seed a
single-elimination bracket, halving the field each round. Arena: continuous re-pairing of the
top two available idle players within a time window. **Where.** `tournaments` (ADR-0015).

### 18. SM-2 spaced repetition
**Why.** Decide when to resurface a puzzle so hard ones return soon and mastered ones fade —
maximising retention without wasteful repetition. **How.** Pure function
`calculateNextReview(state, quality) → state` over `{easeFactor, interval, repetitions}`:
```
quality < 3:  repetitions = 0; interval = 1                       # failed → relearn tomorrow
quality ≥ 3:  ef = max(1.3, ef + 0.1 − (5−q)(0.08 + (5−q)·0.02))
              interval = repetitions==0 ? 1 : repetitions==1 ? 6 : round(interval·ef)
              repetitions += 1
nextReview = today + interval days
```
Binary solve/fail is mapped to SM-2's 0–5 quality by solve time (fail→0, ≥60 s→2, <60→3,
<30→4, <10→5). State lives on the `UserPuzzleAttempt` row — no scheduling table.
**Where.** `puzzles · SpacedRepetitionService` (ADR-0019).

### 19. Glicko-2 puzzle ratings
**Why.** Rate puzzles and players on the same scale so difficulty adapts. **How.** Reuses the
Tier A #1 Glicko-2 update — a solve is a "win" vs the puzzle's rating, a fail a "loss".
**Where.** `puzzles`, calling `elo.ts` (ADR-0020).

### 20–21. Move classification + brilliant detection
**Why.** Turn raw engine evals into labels players understand.
**How.** `classify(cpLoss, playedBest)` — `BEST` when the move *is* the engine move, then
`<20 EXCELLENT · <50 GOOD · <100 INACCURACY · <250 MISTAKE · ≥250 BLUNDER`. Both
evaluations are clamped to ±1000 first, so trading +25 pawns down to +12 is not a blunder.
**Where.** `backend/src/analysis/classify.ts` (ADR-0027; shipped in Stockfish Inc 2).

**#21 brilliant detection is still Tier B.** It needs a sacrifice heuristic — a piece moved
to a square attacked by a lower-value piece and still best — which nothing computes yet.

### 22. ECO opening identification
**Why.** Name the opening played ("Sicilian Defense, Najdorf"). **How.** Longest-prefix match of
the game's move sequence against a static ECO table. **Where.** `analysis` (ADR-0028).

### 23. Depth-18 engine analysis (server-side)
**Why.** Post-game review needs deeper, deterministic evals than the in-browser opponent,
and they must be computed once for everyone rather than per viewer.
**How.** Stockfish 18 lite WASM runs as a **child process** over UCI, `go depth 18 movetime
2000`, one sweep at a time behind a promise chain. **N+1 evaluations for N moves**: the
position after move i is the position before move i+1, so each eval is read by two moves.
Results feed #12b and land in the Postgres `GameAnalysis` table.
**Where.** `backend/src/analysis/analysis.service.ts`. ADR-0010 (BullMQ + MongoDB) is
superseded — both dependencies were deleted by ADR-0032 before this was built.

### 24. Redis-TTL online presence
**Why.** Show who's online, horizontally scalable, self-cleaning on disconnect. **How.**
`SET user:{id}:online 1 EX 35`, refreshed by a 25 s client heartbeat; ungraceful disconnect →
key expires after the 10 s buffer; graceful → `DEL`. Bulk friend lookup via GET/MGET.
**Where.** `social · PresenceService` (ADR-0022).

### 25. BullMQ delayed-job scheduling
**Why.** Advance tournament rounds on a timer without a blocking process. **How.** Redis-backed
delayed jobs fire round-advancement at the scheduled time; survives restarts. **Where.**
`tournaments` cron (ADR-0016).

---

# Tier C — Relied on indirectly (inside our dependencies)

We don't write these, but the platform's correctness and performance rest on them. Worth knowing
for a viva — "what's inside the black box."

| # | Algorithm | Provided by | Backs |
|---|-----------|-------------|-------|
| 26 | Alpha-beta search + iterative deepening | Stockfish (WASM) | AI opponent, analysis |
| 27 | NNUE evaluation | Stockfish (WASM) | move strength |
| 28 | Transposition table (Zobrist hashing) | Stockfish (WASM) | search speed |
| 29 | Legal move generation + check/mate/draw detection | chess.js | move validation everywhere |
| 30 | Threefold / 50-move / insufficient-material draws | chess.js | terminal states |
| 31 | Skip list (sorted set) | Redis | leaderboards (#8), deadlines (#3) |
| 32 | eksblowfish key schedule | bcryptjs | password hashing (#10) |
| 33 | SHA-256 | Node crypto | refresh-token hashing (#11) |
| 34 | HMAC-SHA256 | @nestjs/jwt | JWT signature (#11) |
| 35 | CSPRNG random IDs | Node crypto / nanoid | room ids, tokens (#4, #9, #11) |
| 36 | WebSocket framing + reconnection backoff | Socket.io / RFC 6455 | all real-time transport |

### 26–28. Stockfish search internals
The engine we consume (Stockfish 18 lite WASM) is **minimax with alpha-beta pruning**, driven by
**iterative deepening** (search depth 1, 2, 3… reusing prior results for move ordering), an
**NNUE** (efficiently-updatable neural network) evaluation function, and a **transposition table**
keyed by **Zobrist hashing** to avoid re-searching repeated positions. We drive it over UCI
(Tier A #12); we never implement search ourselves — that's the point of ADR-0009.

### 29–30. chess.js rules engine
Every server-side move re-validation, check/checkmate/stalemate detection, and automatic-draw
rule (threefold repetition, fifty-move, insufficient material) is chess.js. Our authority model
(Tier A #4) depends on this being correct, so we treat it as the single source of chess legality
on both client and server.

### 31. Redis sorted set = skip list
`ZADD`/`ZREVRANGE`/`ZREVRANK` (leaderboards) and `ZRANGEBYSCORE` (clock deadlines) are O(log n)
because a Redis sorted set is a **skip list** plus a hash map. Our choice of sorted sets over a
SQL `ORDER BY … LIMIT` (Tier A #8, #3) is a choice of this data structure.

### 32–35. Cryptographic primitives
- **bcrypt** hashing (#10) is the deliberately-slow **eksblowfish** key schedule — cost factor 10.
- **SHA-256** (Node `crypto`) hashes refresh tokens at rest (#11) so a DB leak reveals no usable token.
- **HMAC-SHA256** signs every JWT (#11) so the server can verify a token it issued without a lookup.
- **CSPRNG** (`crypto.randomBytes`, nanoid) generates unguessable room ids, challenge tokens and
  refresh tokens (#4, #9, #11).

### 36. WebSocket transport
Socket.io sits on **RFC 6455** WebSocket framing (the full-duplex, single-TCP push channel that
makes live moves/clocks possible) and adds **reconnection with backoff**, rooms, and the Redis
adapter for cross-instance fan-out. Every gateway event (Tier A #3, #5, #6) rides this.

---

*Cross-references: Tier A is verified against source; Tier B/C against the feature ADRs under
`docs/features/` and the dependency set in `package.json`. If an ADR and the code ever disagree,
the code wins and this doc should be corrected.*
