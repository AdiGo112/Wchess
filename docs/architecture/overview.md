# System Design — Overview

> The canonical, current description of what WChess actually is. If this file and
> any file under `docs/features/**` disagree, this file wins — those folders were
> written before the v1 scope cut (ADR-0032) and are frozen scaffolding.
>
> Diagrams are not repeated here. `../../Diagrams.md` holds all 16 (C4 L1–L3,
> every flow, the ER diagram, the Redis keyspace, both deployment topologies);
> this file is the prose index to them.

---

## 1 · The one invariant

**The server is the only authority. The client is a renderer.**

Every rule that decides an outcome — legality, whose turn it is, how much time is
left, who won, what the rating becomes — is evaluated on the server against state
the client cannot reach. The browser holds a *prediction*; Redis holds the fact.
On disagreement the room wins and the piece snaps back.

The one deliberate exception proves it: in a vs-computer game, the opponent's
moves are computed by Stockfish WASM **in the player's own browser** (ADR-0009).
Nothing about them needs trusting — those games are unrated, so a tampered client
gains nothing, and the server still validates the move it receives. Same engine
binary, opposite reasoning. Post-game *analysis* runs server-side for the mirror
reason: its verdict is stored once on a shared row, so it has to be trustworthy.

---

## 2 · Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 · Vite · TypeScript (strict) · Tailwind | Plain Context for state — no Zustand, no React Query; neither has been needed yet |
| Realtime (client) | socket.io-client | One default-namespace connection, shared by every hook |
| Engine (client) | Stockfish 18 lite WASM in a Web Worker | `stockfish-18-lite-single`, 7.3 MB, copied into `public/engine/` at `predev`/`prebuild` |
| Backend | NestJS 10 · Socket.io · Passport | Global prefix `/api/v1`, Swagger at `/api/docs`, port 3100 |
| Primary DB | PostgreSQL 16 via Prisma | The only durable store |
| Cache / realtime state | Redis 7 via ioredis | Rooms, queues, leaderboards, presence, socket routing |
| Engine (server) | Stockfish 18 lite WASM as a child process over UCI | Post-game analysis only |
| Auth | JWT HS256 (15 m) + rotating SHA-256 refresh tokens (30 d) | bcryptjs for passwords |
| Rate limiting | `@nestjs/throttler`, global HTTP guard | 10/s · 50/10s · 300/min. Guards do **not** bind to WS gateways |

**Not in the stack, on purpose:** MongoDB (removed 2026-07-19, no consumers),
BullMQ (removed with the v1 scope cut — the analysis queue is an in-process
promise chain), a separate CDN or static host (the Nest server serves the SPA).

---

## 3 · Deployable shape

One Node process, one port.

```
:3100  NestJS
       - /api/v1/**      REST          (Swagger at /api/docs)
       - /socket.io/**   WebSocket     (GameGateway, MatchmakingGateway)
       - /**             frontend/dist (ServeStaticModule, API + socket paths excluded)

:5432  PostgreSQL 16   docker compose
:6379  Redis 7         docker compose
```

In dev, Vite on `:5173` proxies `/api` and `/socket.io` to `:3100`, so the app is
same-origin in both modes and there is no CORS to configure. `VITE_SERVER_URL`
exists only to point at a backend somewhere else; empty means same origin.

Serving the SPA from the API process is a decision, not a shortcut: it makes the
demo a single tunnel and removes the entire class of cross-origin cookie/CORS
bugs. It is also why a frontend build is a backend deploy artifact.

---

## 4 · Module map

Seven directories under `backend/src`. Everything else was deleted by ADR-0032.

| Module | Owns | Talks to |
|---|---|---|
| `auth/` | register, login, refresh rotation, logout, `/me` | Postgres |
| `users/` | public profile, per-variant stats, player directory, `PATCH /users/me` | Postgres |
| `games/` | `GameGateway` — the live game socket: moves, clocks, draw/resign/rematch, terminal states, PGN + ECO at save, Glicko-2 write | Redis (room), Postgres (on end) |
| `matchmaking/` | `MatchmakingGateway` + REST: queues, pairing poll, friend challenges, vs-computer rooms, queue positions | Redis (queues), Postgres (challenges) |
| `leaderboard/` | all-time / week / month boards, own-rank, 60 s cache, reseed-from-Postgres on boot | Redis (ZSETs), Postgres |
| `analysis/` | depth-18 post-game sweep, move classification, per-player accuracy | Stockfish child process, Postgres |
| `common/` | PrismaService, RedisService, Glicko-2 (`utils/elo.ts`), CORS parsing | — |

Diagram: `Diagrams.md` §3.

---

## 5 · Who owns which store

| Store | Holds | Lifetime |
|---|---|---|
| **PostgreSQL** | User, RefreshToken, UserRating, Game, GameAnalysis, Challenge | Durable. The system of record. |
| **Redis** | `game:room:{id}` (the live game), `clock:deadlines` (the sweeper's ZSET), `queue:{variant}:{tc}`, `leaderboard:{variant}`, `online:{userId}`, `user:socket:{userId}`, `socket:{socketId}` | Ephemeral and rebuildable — a full flush costs in-flight games only; boards reseed from Postgres. |
| **Browser** | access token (memory, `useRef`), refresh token (`sessionStorage`) | Tab lifetime. Never `localStorage` — an XSS-readable long-lived token is the thing rotation exists to limit. |

Full keyspace with TTLs: `Diagrams.md` §15. ER diagram: §14.

`Puzzle`, `PuzzleAttempt`, `Tournament` and `TournamentPlayer` remain in
`schema.prisma` with zero references in `backend/src`. Dropping them is a
destructive migration for no runtime gain, and both features are planned
increments.

---

## 6 · The four load-bearing mechanisms

These are the parts that are not obvious from the file tree.

**1 · Move application is compare-and-set.** `game:room:{id}` is one JSON string,
read and rewritten on every move. Two moves can arrive in the same tick, so the
write is conditional on the room being unchanged since the read — a losing writer
retries against fresh state instead of overwriting a legal move. Validation
ladder: `Diagrams.md` §10.

**2 · Clocks live in one Redis sorted set of deadlines, swept every second**
(ADR-0004). A browser cannot be trusted to time itself, and a closed laptop must
still lose on time with nobody present to claim it. The sweeper is the only thing
that flags a flag-fall; the client's countdown is cosmetic.

**3 · Game end is one Prisma `$transaction`.** The `Game` row and both
`UserRating` rows commit together or not at all — a half-written result is a
rating that can never be reconciled, since the game it came from is the only
record of what happened. Pipeline: `Diagrams.md` §13.

**4 · Ratings are Glicko-2, not Elo** (`common/utils/elo.ts`), because a rating
that cannot express its own uncertainty misprices every new player. `RD > 110`
marks a rating as still settling.

---

## 7 · Scaling — the decision and its trigger

Today: **one instance, by decision not accident** (ADR-0032). Server-side clocks
and room state already live in Redis rather than process memory, and Socket.io is
already wired to `@socket.io/redis-adapter`, so the monolith is horizontally
scalable on paper — but a deploy still kills every live game, because the sweeper
and the rooms belong to the process being replaced.

**Trigger for the split:** >5 000 concurrent sockets, *or* the first deploy that
kills a live game a real user cared about. At that point the socket/gateway layer
becomes its own deployable and the REST API scales separately — `Diagrams.md`
§16b, and ADR-0032 for the reasoning and what was rejected.

The 15-microservice map in `Here_is_THE_plan.md` §4 is aspirational and was never
built. Treat it as a sketch of an end state, not a plan of record.

---

## 8 · Where to go next

| Question | File |
|---|---|
| What does the API look like? | `api-reference.md` |
| What socket events exist? | `websocket-events.md` |
| What does the schema look like? | `database-schema.md` |
| Show me a flow | `../../Diagrams.md` (16 diagrams, indexed) |
| Why is it built this way? | `ADR-0032-*.md` here, and the ADRs under `docs/features/NN-*/` |
| How do I ship a change? | `../infrastructure/ci-cd.md` |
| What is the state of the code right now? | `../RESUME.md`, `../CURRENT_SPRINT.md` |
