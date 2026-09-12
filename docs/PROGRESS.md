# ChessWeb — Global Progress Tracker

> Update this file whenever an increment is completed, started, or blocked.
> Legend: ✅ Done | 🔄 In Progress | ⏳ Next Up | ❌ Not Started | 🚫 Blocked

---

## Overall Status

> **Scope cut 2026-07-19 (ADR-0032).** v1 is the core game only. chat, notifications,
> puzzles, tournaments and spectate are **deferred, not cancelled** — their code was
> deleted in `a0ba2c6` and their docs/ADRs remain for when they come back as increments.
> Counts below are v1 scope; the pre-cut totals were 13 backend modules / 51 increments.

| Layer | Done | Partial | Not Started | Total |
|---|---|---|---|---|
| Backend modules (v1) | 4 | 3 | 0 | 7 |
| Frontend areas (v1) | 2 | 4 | 1 | 7 |
| **Increments completed (v1)** | **10** | **0** | **~7** | **~17** |

### Deferred to post-v1

| Feature | State at cut | Re-entry cost |
|---|---|---|
| Chat | backend built, no UI, **no room-authz check** — fix before it returns | low |
| Notifications | backend built, no UI | low |
| Puzzles | service + schema built, no UI, no dataset loaded | medium |
| Tournaments | service + schema built, no UI, **no pairing algorithm** | high — the big one |
| Spectate | handler deleted; count was broken (increment-only) | low |

---

## Feature Progress

### 01 — Auth · `feature/auth` · 4 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend core: register + login, bcrypt, JWT signing | ✅ | `feature/auth` | LocalStrategy wired; login returns accessToken + refreshToken + user |
| 2 | Backend refresh/logout: RefreshToken rotation | ✅ | `feature/auth` | POST /auth/refresh (rotation) + POST /auth/logout (deleteMany) working |
| 3 | Frontend auth: Login, Signup, AuthContext, interceptor | ✅ | `feature/auth` | Token in memory (ref), refreshToken in sessionStorage, queue interceptor, field-level 409 errors |
| 4 | Frontend protection: ProtectedRoute, 401 auto-refresh | ✅ | `feature/auth` | ProtectedRoute with isLoading spinner; logout navigates to /login; manual redirects removed |

---

### 02 — Game Engine · `feature/game-engine` · 3 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend gateway: move validation, clocks, terminal states | ✅ | `main` | join_room, move, resign, all terminal states work |
| 2 | Backend draw + disconnect: offer/accept/decline, auto-resign | ✅ | `feature/game-engine` | Auto-resign timer, reconnect handling, draw accept validation |
| 3 | Frontend board: color lock, rating modal, rematch | ✅ | `feature/game-engine` | isDraggablePiece color lock; draw offerer/receiver split UI; emoji+You rating modal; rematch flow |
| 4 | Server clocks (ADR-0004) + room CAS | ✅ | `feature/server-clocks` | Redis ZSET deadline sweeper (1s), 500ms grace, `clock_sync` push, `ActiveRoom.version` + Lua CAS on every mutation, player-guard on all game actions. 8/8 live e2e (`frontend/scripts/verify-clocks.mjs`) |

---

### 03 — Matchmaking · `feature/matchmaking` · 3 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend queue: Redis Lists, join/leave, match_found | ✅ | `feature/matchmaking` | Rebuilt + verified: service-owned 500ms poll, ADR-0008 tolerance (±50→±400), dedupe, disconnect cleanup, **`queue_position` broadcast every 5s** (closes DELIVERY acceptance gap) |
| 2 | Backend room creation: REST challenge + computer | ✅ | `feature/matchmaking` | Verified: `Challenge` model + migration, POST `/matchmaking/challenge`, `/challenge/:token/accept` (own-accept 403, expired 404, used 409), `/computer` (difficulty in Redis, black=`computer`), `/queue-status`; creator notified via `challenge_accepted` socket event |
| 3 | Frontend lobby: quick match, friend challenge, vs-computer | ✅ | `feature/matchmaking` | `Lobby.jsx` (3 cards) + `useMatchmakingSocket` + `VariantSelector`/`DifficultySlider` + `ChallengeAccept.jsx`; queue position display; Game.jsx redirects to /lobby; Home/Navbar wired; dead `GameControls.jsx` removed. Build passes; all network contracts runtime-verified |

---

### 04 — Stockfish · `feature/stockfish` · 3 effective increments (Inc 1 superseded by ADR-0009)

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | ~~Backend worker: computer-move job, Redis pub/sub bridge~~ | 🚫 **Superseded** | `feature/stockfish` | **Contradicted ADR-0009** (which says computer moves run as browser WASM, no server CPU). The job existed, computed a heuristic move, and only logged it — vs-computer games hung after White's first move. Whole server-side computer-move path **deleted**; processor is analysis-only. |
| 2 | Backend analysis worker: depth-18, move classification, storage | ✅ | `feature/stockfish-inc2` | Built from nothing — the placeholder processor and the whole `stockfish/` module were deleted in the v1 scope cut. `backend/src/analysis/`: Stockfish 18 lite WASM as a **child process** speaking UCI over stdio, one sweep at a time, `POST/GET /analysis/:gameId`, stored in Postgres `GameAnalysis` (Mongo is gone). N+1 evaluations for N moves. 14/14 live; an 80-ply game in 47s with the API staying at 10ms. |
| 3 | Frontend WASM worker: 5 difficulty levels | ✅ | `feature/stockfish` | `hooks/useStockfish.js` — `stockfish-18-lite-single` (7.3MB, no SharedArrayBuffer → no COOP/COEP). Difficulty 1–5 → UCI Skill Level 0–20 + 200–1500ms. Engine copied from node_modules by `scripts/copy-engine.mjs` on predev/prebuild. All 5 levels verified against the real binary. |
| 4 | Frontend integration: computer game flow, difficulty picker | ✅ | `feature/stockfish` | `ChessGame.jsx` thinks on black's turn + "Stockfish is thinking…"; new **`computer_move`** socket event (needed — `handleMove` rejects a move from a socket that doesn't own the turn, and black is `{id:'computer'}`). Server re-validates: vs-computer room, sender is its white player, black to move, chess.js legality. 13/13 e2e checks pass on the live stack. |

---

### 05 — Leaderboard · `feature/leaderboard` · 3 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend Redis: ZADD on game end, ZREVRANGE, enrichment | ✅ | `main` | seedFromDatabase(), top-100 working |
| 2 | Backend time-scoped boards + 60s cache | ✅ | `feature/leaderboard-polish` | Period-bucketed ZSETs `leaderboard:{week:isoWeek\|month:yyyy-mm}:{variant}`, self-expiring via TTL (week 14d / month 62d, re-armed on write); `updateScore` writes all-time+week+month; 60s read-cache on the enriched top-N (empty results uncached). **Live boards, not start-of-period snapshots** — documented variance. `?period=all\|week\|month` on both endpoints |
| 3 | Frontend: variant tabs, period filter, own rank row | ✅ | `feature/leaderboard-polish` | Period segmented control added under the variant tabs; own-rank row (via `/leaderboard/rank/:id?period=`) shown only when you're outside the top 100, with an "unrated → play a game" prompt when rank is null; "(you)" highlight ring on your row when visible. 16/16 live e2e (`frontend/scripts/verify-leaderboard.mjs`) |

---

### 06 — Chat · `feature/chat` · 3 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend core: send_message, get_history (paginated) | ⏳ | `feature/chat` | Exists; no pagination yet |
| 2 | Backend safeguards: typing events, rate limit, profanity | ❌ | `feature/chat` | Not started |
| 3 | Frontend: chat panel, message list, typing indicator | ❌ | `feature/chat` | Not started |

---

### 07 — Tournaments · `feature/tournaments` · 6 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend CRUD: list, get, create | ⏳ | `feature/tournaments` | Scaffolded; basic CRUD exists |
| 2 | Backend join/leave/standings | ⏳ | `feature/tournaments` | Exists; tiebreak sorting needs work |
| 3 | Backend Swiss pairing algorithm | ❌ | `feature/tournaments` | Not started |
| 4 | Backend Arena + RR + KO formats | ❌ | `feature/tournaments` | Not started |
| 5 | Backend BullMQ cron: round advancement | ❌ | `feature/tournaments` | Not started |
| 6 | Frontend: list, detail, standings, bracket | ❌ | `feature/tournaments` | Not started |

---

### 08 — Puzzles · `feature/puzzles` · 5 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend import + CRUD: Lichess CSV, getDailyPuzzle, getById | ⏳ | `feature/puzzles` | getDailyPuzzle + getById exist; no import script |
| 2 | Backend solve flow: submitAttempt, Glicko-2 puzzle rating | ⏳ | `feature/puzzles` | submitAttempt exists; no Glicko-2 update |
| 3 | Backend SM-2: nextReviewAt, getNext, Redis daily cache | ❌ | `feature/puzzles` | nextReviewAt field missing from schema |
| 4 | Frontend play: puzzle board, submit, result feedback | ❌ | `feature/puzzles` | Not started |
| 5 | Frontend browse: daily widget, list, streak, rating | ❌ | `feature/puzzles` | Not started |

---

### 09 — Social · `feature/social` · 5 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend Prisma models: Friendship, Follow | ❌ | `feature/social` | Models missing from schema |
| 2 | Backend friendship CRUD: request/accept/decline/block | ❌ | `feature/social` | Not started |
| 3 | Backend follows + online presence | ❌ | `feature/social` | Not started |
| 4 | Backend activity feed (MongoDB, TTL 90d) | ❌ | `feature/social` | Not started |
| 5 | Frontend: friends list, online dots, activity feed | ❌ | `feature/social` | Not started |

---

### 10 — Notifications · `feature/notifications` · 4 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | Backend MongoDB store: CRUD, markRead, unreadCount | ⏳ | `feature/notifications` | Schema + CRUD scaffolded |
| 2 | Backend Socket gateway: real-time delivery | ❌ | `feature/notifications` | Not started |
| 3 | Backend email worker: BullMQ + SendGrid, rate limit | ❌ | `feature/notifications` | Not started |
| 4 | Frontend: bell icon, dropdown, mark-read, real-time | ❌ | `feature/notifications` | Not started |

---

### 11 — Analysis · `feature/analysis` · 5 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 1 | ~~Backend BullMQ job: request-analysis endpoint, enqueue~~ | ✅ **Delivered elsewhere** | `feature/stockfish-inc2` | `POST /analysis/:gameId` exists. No BullMQ: Bull went with ADR-0032, and one out-of-process engine plus a promise chain is the whole queue on a single instance. |
| 2 | ~~Backend move classifier: centipawn loss thresholds~~ | ✅ **Delivered elsewhere** | `feature/stockfish-inc2` | `backend/src/analysis/classify.ts` — BEST/EXCELLENT/GOOD/INACCURACY/MISTAKE/BLUNDER on clamped centipawn loss, plus Lichess-formula accuracy. 14 unit tests. |
| 3 | Backend ECO lookup: static table, opening identification | ✅ | `feature/eco-openings` | `games/openings.ts` — longest-prefix match on the SAN list, written into `Game.openingEco` / `openingName` at save (the third dead column, after `pgn` and the redundant indexes) plus standard `[ECO]` / `[Opening]` PGN tags. Main lines only: an unlisted line degrades to the nearest shorter prefix, so it is vaguer, never wrong. |
| 4 | Frontend analysis board: step through moves, eval bar | ✅ | `feature/analysis-ui` | `pages/GameReview.tsx` at `/review/:gameId`. Board replayed from the stored SAN, arrow keys + buttons + clickable move list, eval bar off `evalCp`, `?!`/`?`/`??` annotation in the move list, per-player accuracy with a classification tally, engine suggestion ringed on the board. |
| 5 | Frontend post-game: auto-trigger, accuracy modal, link | ✅ | `feature/analysis-ui` | Opening a review queues its own sweep and polls. Review links from every game-history row and from the game-over modal (`game_over` now carries the persisted `gameId`). Accuracy is a panel on the page rather than a modal — a modal you dismiss to reach the board it describes is the wrong shape. |

---

### 12 — Frontend UI · `feature/frontend-ui` · 6 increments

| # | Increment | Status | Branch | Notes |
|---|---|---|---|---|
| 0 | TypeScript migration (foundational, precedes all below) | ✅ | `feature/ts-migration` | All 27 src files JSX/JS → TSX/TS; `strict: true`; shared `src/types.ts` transcribes the socket + REST contracts from `websocket-events.md`/`api-reference.md`; `@types/react` pinned to 18 to match runtime; `tsc --noEmit` added to build gate. tsc + vite build clean, dev-server entry graph transforms with 0 errors |
| 1 | Zustand stores: auth, game, ui, notification | ❌ | `feature/frontend-ui` | Not started |
| 2 | React Query hooks: all API hooks | ❌ | `feature/frontend-ui` | Not started |
| 3 | Sound effects: useSound hook, all game sounds | ❌ | `feature/frontend-ui` | Not started |
| 4 | Board themes + piece sets (5 themes, 4 sets) | ❌ | `feature/frontend-ui` | Not started |
| 5 | Dark mode + layout polish: skeleton loaders, toasts | ❌ | `feature/frontend-ui` | Not started |
| 6 | Mobile layout + a11y: touch board, keyboard shortcuts | ❌ | `feature/frontend-ui` | Not started |

---

## Completion Summary

| Feature | Increments Done | Total | % |
|---|---|---|---|
| Auth | 4 | 4 | 100% |
| Game Engine | 3 | 3 | 100% |
| Matchmaking | 3 | 3 | 100% |
| Stockfish | 3 | 3 | 100% |
| Leaderboard | 3 | 3 | 100% |
| Chat | 0 | 3 | 0% |
| Tournaments | 0 | 6 | 0% |
| Puzzles | 0 | 5 | 0% |
| Social | 0 | 5 | 0% |
| Notifications | 0 | 4 | 0% |
| Analysis | 5 | 5 | 100% |
| Frontend UI | 0 | 6 | 0% |
| **Total** | **21** | **51** | **41%** |

Leaderboard Inc 2 + 3 shipped in `8e1a6d6` but this table still read 1/3 until
2026-08-16.

Stockfish Inc 2 also closes Analysis increments 1 and 2 — the analysis endpoint
and the move classifier are the same code, and splitting them across two feature
branches would have meant building the engine plumbing twice. Analysis 3-5 (ECO
lookup, analysis board, post-game modal) are still open.

The **Total** row did not add up before this pass either: the rows above it summed
to 15 while the total read 11. It is a plain sum of the column now.

Analysis is complete as of 2026-09-08.

---

## Cross-cutting work (not increment-shaped)

| Item | Status | Branch | Notes |
|---|---|---|---|
| Server clocks + room CAS + $transaction + throttler + env URLs | ✅ | `feature/server-clocks` | First-sprint blockers from ADR-0032; 8/8 live |
| TypeScript migration (frontend) | ✅ | `feature/ts-migration` | All 27 files → `.ts`/`.tsx`, strict, contracts in `types.ts` |
| `join_room` authz fix | ✅ | `fix/join-room-authz` | Non-player disconnect could forfeit the real black player; 2/2 live |
| Port 3000 → 3100, single-origin proxy, serve-static | ✅ | `dev` | `ad5c38a`, `8ea141f`, `dd7a1a4` — merged in `81c78e1`, unlogged until 2026-08-16 |
| **Pre-Increment-2 hardening pass** | ✅ | `feature/pre-inc2-hardening` | ~30 defects: unauthenticated game history, non-player clock start, dead rematch, no room re-join on reconnect, round-trip-bound moves, rejected promotions, Profile showing 0/0/0, `/players` + `/profile/edit` blank pages, serial Redis on game end, unread `REFRESH_TOKEN_EXPIRES_DAYS`, unpruned refresh tokens, empty `Game.pgn`, redundant indexes, and the live docs. **19/19 live** (`verify-hardening.mjs`), migration `drop_redundant_indexes` applied, both builds clean. Running it also exposed a Nest module-init ordering bug in the new leaderboard seed (`2d792a1`). See `docs/CURRENT_SPRINT.md`. |
| **CI pipeline + system-design docs** | ✅ | `chore/ci-pipeline` | First `.github/`: backend (test + build), frontend (typecheck + build), and a branch-promotion guard that rejects a PR skipping `dev` or `staging`. Plus the docs the pipeline exposed as stale — `architecture/overview.md` rewritten (it still listed MongoDB, BullMQ and five deleted modules), `infrastructure/environment.md` corrected against the real `process.env` reads, `docker-setup.md` de-duplicated from `docker-compose.yml`, and `Diagrams.md` §15 given the missing `clock:deadlines` ZSET. New: `infrastructure/ci-cd.md`. Verified locally 8/8 on the promotion guard. Pushed 2026-09-12; `.github/setup-branch-protection.sh` applies the branch protection that makes the promotion job binding. |
