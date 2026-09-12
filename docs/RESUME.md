# ChessWeb — Resume Point

> Read this when picking up the project after any break — a day, a week, or longer.
> It tells you the exact state of the codebase and how to get running in 3 commands.

---

## Start Dev Environment

```bash
docker compose up -d                        # PostgreSQL :5432 + Redis :6379  (Mongo removed 2026-07-19)
cd backend && npm run start:dev             # NestJS API :3100, Swagger :3100/api/docs
cd frontend && npm run dev                  # React :5173 (proxies /api + /socket.io to :3100)
```

First time only:
```bash
cd backend && npx prisma migrate dev        # run migrations
```

There is no seed script — `backend/package.json` has no `prisma.seed` entry and
no `prisma/seed.ts` exists. Register users through the app or a verify script.

**One-port demo:** build the frontend (`cd frontend && npm run build`); the
backend then serves the SPA, so everything is on `:3100`.

---

## Documentation State (as of 2026-06-24)

All 12 feature documentation suites are **complete** under `docs/features/NN-feature/`. Every feature folder contains:
- `START_HERE.md`, `README.md`, `ARCHITECTURE.md`, `DOMAIN_MODEL.md`, `API_DESIGN.md`, `WORKFLOWS.md`
- `ADR-XXXX-*.md` (architecture decisions)
- `AUTOMATED_TESTING_STRATEGY.md`, `AUTOMATED_TESTING_PROMPT.md`
- `DELIVERY_NOTES.md`
- `IMPLEMENTATION_PLAN_INCREMENT_N.md` (one per increment)
- `IMPLEMENTATION_PROMPT_INCREMENT_N.md` (one per increment — copy-paste ready for AI coding sessions)
- `IMPLEMENTATION_PROMPT_BACKEND.md`, `IMPLEMENTATION_PROMPT_FRONTEND.md`

**Next action: merge `plan` → `main`, then cut `feature/auth` branch.**

---

## Current Codebase State (as of 2026-06-23)

### What actually works end-to-end
- Two players can connect via Socket.io, be matched, play a full chess game with server-side clocks, and have Glicko-2 ratings updated on game end.
- User registration and login return a JWT access token (no refresh/logout yet).
- **A player can play a full game against real Stockfish** — WASM in a browser Web Worker (ADR-0009), zero server CPU. Difficulty 1–5 maps to UCI skill level + think time.

### Backend — what exists

Six modules exist under `backend/src`. Everything else was deleted in the v1
scope cut (ADR-0032).

| Module | Location | Working? | Gap |
|---|---|---|---|
| Auth | `backend/src/auth/` | ✅ | register/login/refresh/logout/me all done. Rotating SHA-256 refresh tokens; expired rows swept on login + logout (no cron). |
| Games | `backend/src/games/` | ✅ | Gateway + server clocks + CAS + Glicko-2 + PGN on save. Analysis is not built (that's Stockfish Inc 2). |
| Matchmaking | `backend/src/matchmaking/` | ✅ | Queue + challenges + vs-computer + queue positions, all verified live |
| Leaderboard | `backend/src/leaderboard/` | ✅ | All-time / week / month boards, 60s cache, own-rank, reseed-from-Postgres on boot |
| Users | `backend/src/users/` | ✅ | Public profile, per-variant stats, player directory (`GET /users`), `PATCH /users/me` |
| Common | `backend/src/common/` | ✅ | Prisma, Redis, Glicko-2 (`elo.ts`), CORS parsing |
| Analysis | `backend/src/analysis/` | ✅ | Depth-18 post-game sweep, move classification, per-player accuracy, stored in `GameAnalysis`. Engine is Stockfish 18 lite WASM as a **child process** speaking UCI over stdio — see the ADR-0009 note below. |
| Chat / Notifications / Puzzles / Tournaments / Social | — | ❌ | Cut by ADR-0032; see `docs/FUTURE_SCOPE.md` |

**Two engines, on purpose.** Computer *opponent* moves run as WASM in the
player's browser (ADR-0009) so they cost the server nothing. Post-game
*analysis* cannot work that way — every viewer would re-derive the same numbers,
and a client-submitted verdict on a shared game row is unauthenticated data — so
the server runs the same wasm build in a child process. Same binary, opposite
reasons.

### Frontend — what exists

Everything under `frontend/src` is TypeScript (`.ts`/`.tsx`) since the
ts-migration branch — the `.jsx` paths older revisions listed no longer exist.

| Area | Location | Working? | Gap |
|---|---|---|---|
| AuthContext | `frontend/src/context/AuthContext.tsx` | ✅ | Token in memory (useRef), refreshToken in sessionStorage, silent restore |
| SocketContext | `frontend/src/context/SocketContext.tsx` | ✅ | Refreshes the token on `connect_error`; surfaces gateway `error` events and `reconnect_failed` as toasts |
| Login / Signup pages | `frontend/src/pages/` | ✅ | Signup has confirmPassword + field-level 409 errors; Login has `from` redirect |
| ChessGame component | `frontend/src/components/ChessGame.tsx` | ✅ | Optimistic moves, auto-queen promotion, re-joins the room on reconnect, colour lock, draw split UI, rematch flow. Board fills the frame on the left, clocks/moves/controls in a column to its right; the page does not scroll. |
| Lobby / Matchmaking | `frontend/src/pages/Lobby.tsx` | ✅ | Quick match (live queue position) / friend challenge / vs-computer; `/challenge/:token` accept page |
| Leaderboard page | `frontend/src/pages/Leaderboard.tsx` | ✅ | Variant tabs + period filter + own-rank row |
| GameHistory page | `frontend/src/pages/GameHistory.tsx` | ✅ | Wired to `GET /games/history/:userId`; every row links into the review |
| Game review page | `frontend/src/pages/GameReview.tsx` | ✅ | `/review/:gameId` — eval bar, step-through board, annotated move list, per-player accuracy. Queues its own analysis on open. |
| Profile page | `frontend/src/pages/Profile.tsx` | ✅ | Real per-variant ratings, W/L/D and recent games; `/profile/edit` saves via `PATCH /users/me`. No avatar upload. |
| Player directory | `frontend/src/components/PlayerList.tsx` | ✅ | Wired to `GET /users` |
| Home page | `frontend/src/pages/Home.tsx` | Partial | Hero + mode cards; no puzzle widget or activity feed (both deferred) |
| Zustand stores | — | ❌ | Not started — plain context is still sufficient |
| React Query | — | ❌ | Not started |

### Database state
- PostgreSQL: migrations applied via Prisma; all models in schema exist except `Friendship` and `Follow`
- `Puzzle` / `PuzzleAttempt` / `Tournament` / `TournamentPlayer` models remain in the schema but have **zero references** in `backend/src` — kept on purpose, since dropping them is a destructive migration for no runtime gain
- Redis: no persistent data; populated at runtime. The leaderboard reseeds itself from Postgres on boot if its boards are empty.

---

## Known Bugs / Broken Things

| Severity | Location | Description |
|---|---|---|
| Low | `backend/src/games/openings.ts` | The ECO table covers main lines only, so an off-book game gets a vaguer name ("Sicilian Defence" rather than a specific variation). Games recorded before 2026-09-08 have no opening at all — the columns are filled at save and nothing backfills. |
| Low | `frontend/src/components/ChessGame.tsx` | Promotion is auto-queen — there is no promotion picker. |

_Fixed 2026-07-12: the `computer-move` job whose result was logged but never emitted — the whole server-side computer-move path is gone; the engine now runs in the browser per ADR-0009._

_Fixed in the pre-Increment-2 hardening pass: unauthenticated `GET /games/history/:userId`; a non-player's `join_room` starting a waiting room's clock; rematch navigating into a frozen room id; no room re-join after socket reconnect; every move costing a full round trip; promotions being rejected outright; Profile showing 0/0/0 for everyone; `/players` and `/profile/edit` rendering blank pages; refresh tokens accumulating forever._

---

## Key File Locations

| What | Where |
|---|---|
| Prisma schema | `backend/prisma/schema.prisma` |
| NestJS entry | `backend/src/main.ts` |
| Game Gateway | `backend/src/games/game.gateway.ts` |
| Glicko-2 util | `backend/src/common/utils/elo.ts` |
| Analysis engine + queue | `backend/src/analysis/analysis.service.ts` |
| ECO opening table + matcher | `backend/src/games/openings.ts` (unit tests beside it) |
| Move classification + accuracy maths | `backend/src/analysis/classify.ts` (unit tests beside it) |
| Axios client + refresh interceptors | `frontend/src/api.ts` |
| Socket context | `frontend/src/context/SocketContext.tsx` |
| Socket + REST contracts | `frontend/src/types.ts` |
| Docker services | `docker-compose.yml` |
| CI pipeline | `.github/workflows/ci.yml` |
| Pipeline + branch workflow | `docs/infrastructure/ci-cd.md` |
| System design (start here) | `docs/architecture/overview.md` |
| All 16 diagrams | `Diagrams.md` (repo root) |
| Stockfish WASM hook | `frontend/src/hooks/useStockfish.ts` |
| Board sizing (both board pages) | `frontend/src/hooks/useBoardFit.ts` |
| Live verification scripts | `frontend/scripts/verify-*.mjs`, `backend/scripts/verify-*.mjs` |
| Engine copy script | `frontend/scripts/copy-engine.mjs` (runs on `predev`/`prebuild`; `public/engine/` is gitignored) |
| Full API reference | `docs/architecture/api-reference.md` |
| WebSocket events | `docs/architecture/websocket-events.md` |
| DB schema | `docs/architecture/database-schema.md` |

---

## Environment Variables Needed

**Backend (`backend/.env`)** — see `backend/.env.example`:
```
DATABASE_URL=postgresql://chess:chess123@localhost:5432/chessweb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
PORT=3100
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

`MONGODB_URI` is gone — Mongo was removed from the stack on 2026-07-19 and has
no consumers. `CORS_ORIGIN=*` reflects **any** origin with `credentials: true`;
it exists for throwaway tunnel demos and logs a `[SECURITY]` warning on boot.
Never deploy it.

**Frontend (`frontend/.env`)** — see `frontend/.env.example`:
```
VITE_SERVER_URL=            # leave empty for same-origin (dev proxy / one-port prod)
```

One var, not the `VITE_API_URL` / `VITE_WS_URL` pair older revisions of this file
described — both the axios client and the socket derive their origin from it, and
an empty value means "same origin".

---

## Recommended Reading Order (for a new session)

1. `docs/CURRENT_SPRINT.md` — what's happening right now
2. `docs/PROGRESS.md` — increment-level status across all features
3. `docs/architecture/api-reference.md` + `websocket-events.md` — the live contracts
4. `docs/features/NN-feature/START_HERE.md` — orientation for the feature you're working on

> **`docs/features/**` is frozen scaffolding.** Those folders were written before
> the v1 scope cut and the 3000 → 3100 port move; their curl examples, env var
> names and module lists are historical, not current. Trust
> `docs/architecture/` and this file instead.

---

_Last updated: 2026-09-12 (`chore/ci-pipeline`: first CI pipeline — backend test+build,
frontend typecheck+build, branch-promotion guard — plus a correction pass over the docs
it exposed as stale. `docs/architecture/overview.md` is now the canonical system design;
`docs/infrastructure/ci-cd.md` is new and carries the branch workflow.)_

_Previous: 2026-09-08 (Analysis increments 3, 4 and 5: ECO naming, the review page, plus the
first real browser walk-through of every route).
Previous: 2026-09-07 Stockfish Increment 2, server-side post-game analysis.
Previous: 2026-08-16 pre-Increment-2 hardening (security, game-path, UI and docs;
ports/env corrected to 3100 + VITE_SERVER_URL)._
