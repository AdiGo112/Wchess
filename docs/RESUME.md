# ChessWeb — Resume Point

> Read this when picking up the project after any break — a day, a week, or longer.
> It tells you the exact state of the codebase and how to get running in 3 commands.

---

## Start Dev Environment

```bash
docker compose up -d                        # PostgreSQL :5432 + Redis :6379  (Mongo removed 2026-07-19)
cd backend && npm run start:dev             # NestJS API :3000, Swagger :3000/api/docs
cd frontend && npm run dev                  # React :5173
```

First time only:
```bash
cd backend && npx prisma migrate dev        # run migrations
cd backend && npx prisma db seed            # seed initial data (if seed script exists)
```

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

| Module | Location | Working? | Gap |
|---|---|---|---|
| Auth | `backend/src/auth/` | Partial | No `/refresh` or `/logout`; RefreshToken model in Prisma but not used |
| Game Gateway | `backend/src/game/` | ✅ | Missing 60s disconnect auto-resign timer |
| Matchmaking | `backend/src/matchmaking/` | ✅ | Inc 1 queue + Inc 2 REST (challenge/computer/queue-status) done & verified on `feature/matchmaking`; only Inc 3 frontend lobby left |
| Stockfish | `backend/src/stockfish/` | ✅ (computer games) | Computer moves now run as WASM **in the browser** (ADR-0009) and come back via the `computer_move` socket event — the server-side computer-move worker was deleted. The `analysis` job is still a **placeholder returning a random move** (Inc 2). |
| Leaderboard | `backend/src/leaderboard/` | ✅ | Missing weekly/monthly boards and 60s cache |
| Chat | `backend/src/chat/` | Partial | No pagination, no typing events, no rate limit |
| Notifications | `backend/src/notifications/` | Partial | CRUD only; no socket delivery or email |
| Puzzles | `backend/src/puzzles/` | Partial | No SM-2, no Glicko-2 puzzle rating, no import script |
| Tournaments | `backend/src/tournaments/` | Partial | Basic CRUD + join/leave; no pairing algorithms |
| Users | `backend/src/users/` | Scaffolded | Profile update not implemented |
| Social | — | ❌ | Not started; Friendship/Follow models missing from Prisma |
| Analysis | — | ❌ | Not started |

### Frontend — what exists

| Area | Location | Working? | Gap |
|---|---|---|---|
| AuthContext | `frontend/src/context/AuthContext.jsx` | ✅ | Token in memory (useRef), refreshToken in sessionStorage, silent restore |
| Login / Signup pages | `frontend/src/pages/` | ✅ | Signup has confirmPassword + field-level 409 errors; Login has `from` redirect |
| ChessGame component | `frontend/src/components/ChessGame.jsx` | ✅ | Color lock, draw split UI, rating modal with emoji, rematch flow |
| SocketContext | `frontend/src/context/SocketContext.jsx` | ✅ | — |
| Leaderboard page | `frontend/src/pages/Leaderboard.jsx` | Partial | No variant tabs or period filter |
| GameHistory page | `frontend/src/pages/GameHistory.jsx` | Partial | No API calls wired |
| Profile page | `frontend/src/pages/Profile.jsx` | Partial | No stats, no avatar upload |
| Home page | `frontend/src/pages/Home.jsx` | Partial | No hero, puzzle widget, or activity feed |
| Lobby / Matchmaking | `frontend/src/pages/Lobby.jsx` | ✅ | Quick match (with live queue position) / friend challenge / vs-computer; `useMatchmakingSocket` hook; `/challenge/:token` accept page. Build + all network contracts + **Playwright browser pass** all verified |
| Zustand stores | — | ❌ | Not started |
| React Query | — | ❌ | Not started |

### Database state
- PostgreSQL: migrations applied via Prisma (latest: `add_challenge`); all models in schema exist except `Friendship` and `Follow`
- MongoDB: collections created on first write (no migration needed)
- Redis: no persistent data; populated at runtime

---

## Known Bugs / Broken Things

| Severity | Location | Description |
|---|---|---|
| Medium | `backend/src/stockfish/stockfish.processor.ts` | `@Process('analysis')` is a placeholder: returns a **random legal move** and `evaluation: 0`. No real engine runs on the server. Increment 2 owns this. |
| Low | `backend/src/auth/auth.service.ts` | No `/auth/refresh` or `/auth/logout`; refresh tokens accumulate in DB |

_Fixed 2026-07-12: the `computer-move` job whose result was logged but never emitted — the whole server-side computer-move path is gone; the engine now runs in the browser per ADR-0009._

---

## Key File Locations

| What | Where |
|---|---|
| Prisma schema | `backend/prisma/schema.prisma` |
| NestJS entry | `backend/src/main.ts` |
| Game Gateway | `backend/src/game/game.gateway.ts` |
| Glicko-2 util | `backend/src/utils/elo.ts` |
| Axios client | `frontend/src/api/client.ts` |
| Socket context | `frontend/src/context/SocketContext.jsx` |
| Docker services | `docker-compose.yml` |
| Stockfish WASM hook | `frontend/src/hooks/useStockfish.js` |
| Engine copy script | `frontend/scripts/copy-engine.mjs` (runs on `predev`/`prebuild`; `public/engine/` is gitignored) |
| Full API reference | `docs/architecture/api-reference.md` |
| WebSocket events | `docs/architecture/websocket-events.md` |
| DB schema | `docs/architecture/database-schema.md` |

---

## Environment Variables Needed

**Backend (`backend/.env`):**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/chessweb
MONGODB_URI=mongodb://localhost:27017/chessweb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=30d
```

**Frontend (`frontend/.env`):**
```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=http://localhost:3000
```

---

## Recommended Reading Order (for a new session)

1. `docs/CURRENT_SPRINT.md` — what's happening right now
2. `docs/PROGRESS.md` — increment-level status across all features
3. `docs/features/NN-feature/START_HERE.md` — orientation for the feature you're working on
4. `docs/features/NN-feature/IMPLEMENTATION_PROMPT_INCREMENT_N.md` — copy into chat to start coding

---

_Last updated: 2026-07-12 (Stockfish — browser-WASM computer games working end to end; server-side computer-move path deleted per ADR-0009)_
