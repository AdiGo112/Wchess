# ChessWeb — Plan Branch Summary

This branch (`plan`) contains no executable code. It exists purely to document what we're building before we build it. All implementation happens on `feature/*` branches off `main`.

The authoritative masterplan is `Here_is_THE_plan.md` at the repo root (2345 lines, produced by Ultraplan).

---

## What's in this branch

```
docs/
├── PLAN_SUMMARY.md              ← you are here
├── README.md                    — docs folder guide + branch/implementation order
├── architecture/
│   ├── overview.md              — stack, service map, data flow, DB ownership
│   ├── database-schema.md       — full Prisma schema, MongoDB schemas, Redis key reference
│   ├── api-reference.md         — all REST endpoints (49 total across 11 modules)
│   └── websocket-events.md      — all Socket.io events (client↔server, all gateways)
├── features/
│   ├── 01-auth.md
│   ├── 02-game-engine.md
│   ├── 03-matchmaking.md
│   ├── 04-stockfish.md
│   ├── 05-leaderboard.md
│   ├── 06-chat.md
│   ├── 07-tournaments.md
│   ├── 08-puzzles.md
│   ├── 09-social.md
│   ├── 10-notifications.md
│   ├── 11-analysis.md
│   └── 12-frontend-ui.md
└── infrastructure/
    ├── docker-setup.md          — docker compose up, Prisma migrations, port map
    ├── environment.md           — all .env variables, backend + frontend
    └── deployment.md            — VPS (PM2 + Nginx), cloud (managed DBs), Kubernetes
```

---

## Current Implementation Status

> Scanned from `main` branch as of June 2026. Code scaffolded by Ultraplan; not all modules are production-complete.

### Legend
- ✅ Done and functional
- ⚠️ Scaffolded — exists but incomplete
- ❌ Not yet started

---

### Backend (`backend/src/`)

| Module | Status | What's done | What's missing |
|---|---|---|---|
| **Auth** | ⚠️ | register, login, getMe, bcrypt (12 rounds), JWT signing, error codes AUTH_001–006, auto-creates 4 UserRating rows on register | `/auth/refresh` and `/auth/logout` endpoints — `RefreshToken` model exists in Prisma schema but `AuthService` doesn't use it yet |
| **Game Gateway** | ✅ | `join_room`, `move` (chess.js validation + clock deduction + all terminal states), `resign`, `offer_draw`, `accept_draw`, `decline_draw`, `claim_timeout`, `spectate`, disconnect grace message, Stockfish trigger hook | Takeback events, 60s disconnect auto-resign timer |
| **Matchmaking** | ✅ | Redis List queues per variant, join/leave queue, rating-tolerance pairing (±100→±400 relaxation), `setInterval` 500ms polling, `match_found` emit to both sockets, `create_room` for computer/friend games | Not using BullMQ (uses `setInterval` instead — fine for now), `create_room` has a broken dynamic import that needs fixing |
| **Stockfish** | ⚠️ | BullMQ `@Processor('stockfish')` with `computer-move` and `analysis` jobs wired | No real Stockfish binary/WASM — currently uses chess.js heuristic (prefers captures → checks → random). Result from `computer-move` job is not routed back to the socket (just logs). Needs Redis pub/sub bridge to `GameGateway.emitComputerMove()` |
| **Leaderboard** | ✅ | `ZADD`/`ZREVRANGE`/`ZREVRANK`/`ZSCORE` via Redis, PostgreSQL enrichment (username/avatar), `seedFromDatabase()` | 60s cache layer, weekly/monthly time-scoped boards |
| **Chat** | ⚠️ | `send_message` (saves to MongoDB, broadcasts to room), `get_history` (last 50, paginated) | Typing indicators (`typing_start/stop`), profanity filter, 1 msg/sec rate limit |
| **Notifications** | ⚠️ | MongoDB schema + CRUD: `create`, `getForUser`, `markRead`, `markAllRead`, `getUnreadCount` | Socket.io delivery gateway, BullMQ email worker (SendGrid), trigger wiring from game/social events |
| **Puzzles** | ⚠️ | `getDailyPuzzle` (deterministic by date), `getById`, `getNext` (avoids last 20 seen), `submitAttempt` (validates move sequence) | True SM-2 spaced repetition (`nextReviewAt` field missing from schema), Glicko-2 puzzle rating update, Redis cache for daily puzzle |
| **Tournaments** | ⚠️ | CRUD (list/get/create), `join`, `leave`, `getStandings` (score + tiebreak sorted) | Swiss/Arena/RR/KO pairing algorithms, round management, BullMQ cron for round auto-advancement |
| **Users** | ⚠️ | Module scaffolded | Profile update, avatar upload, game history endpoint |
| **Glicko-2** (`utils/elo.ts`) | ✅ | Full Illinois algorithm — rating, RD, volatility. `updateGlicko2()`, `getRatingChange()`, `variantFromTimeControl()` | — |
| **Prisma Schema** | ✅ | User, UserRating (Glicko-2 fields), Game (full), Tournament, TournamentPlayer, Puzzle, PuzzleAttempt, RefreshToken — all with correct indexes | Friendship and Follow models missing (needed for social feature) |
| **Social** | ❌ | Not started | Entire module |
| **Analysis** | ❌ | Not started | Entire module |

---

### Frontend (`frontend/src/`)

| Area | Status | What's done | What's missing |
|---|---|---|---|
| **Auth** | ⚠️ | `AuthContext` with login/logout/getMe on mount, Login page, Signup page, axios interceptor (JWT Bearer header) | Access token stored in `localStorage` (should be in memory); no auto-refresh on 401; no `ProtectedRoute` wrapper |
| **ChessGame** | ⚠️ | Socket events: `join_room`, `game_start`, `move_made`, `game_over`, `draw_offered`, `opponent_disconnected`, `invalid_move`. Board renders with `react-chessboard`. Timers, move history, draw/resign controls present. | Board not locked to player's color (both sides can drag); no rematch flow; no rating change display in modal |
| **SocketContext** | ✅ | Socket.io connection with JWT auth, exposed via `useSocket()` hook | — |
| **Leaderboard page** | ⚠️ | Basic page exists | Variant tabs, period filter (week/month), user's own rank row |
| **GameHistory page** | ⚠️ | Page exists | Actual API calls to fetch game history |
| **Profile page** | ⚠️ | Page exists | Stats per variant, rating chart, avatar upload, friend/follow buttons |
| **Home page** | ⚠️ | Page exists | Hero, daily puzzle widget, activity feed, live games ticker |
| **Lobby / Matchmaking** | ❌ | Not started | Quick match, friend challenge, vs-computer, local modes |
| **Tournament pages** | ❌ | Not started | List, detail, standings, bracket |
| **Puzzle pages** | ❌ | Not started | Browse, play, daily puzzle |
| **Social / Friends** | ❌ | Not started | Friend list, online status, activity feed |
| **Notifications** | ❌ | Not started | Bell icon, dropdown, real-time delivery |
| **Analysis board** | ❌ | Not started | Standalone board, eval bar, post-game review |
| **State (Zustand)** | ❌ | Not started | `auth.store`, `game.store`, `ui.store`, `notification.store` |
| **Server state (React Query)** | ❌ | Not started | All API hooks |
| **Sound effects** | ❌ | Not started | move, capture, check, castle, promote, game-start/end |
| **Board themes / dark mode** | ❌ | Not started | 5 board themes, 4 piece sets, dark/light toggle |

---

### Summary counts

| | Backend modules | Frontend areas |
|---|---|---|
| ✅ Done | 3 (GameGateway, Matchmaking, Glicko-2) | 1 (SocketContext) |
| ⚠️ Partial | 8 (Auth, Leaderboard, Chat, Notifications, Puzzles, Tournaments, Prisma, Users) | 5 (ChessGame, Auth, Leaderboard, GameHistory, Profile/Home) |
| ❌ Not started | 2 (Social, Analysis) | 8 (Lobby, Tournaments, Puzzles, Social, Notifications, Analysis, Zustand, React Query) |

**The core game loop works end-to-end** — two players can connect, be matched, play a full game with clocks, and have ratings updated. Everything else needs completing or fixing.

---

## Technology Choices

| Layer | Choice | Reason |
|---|---|---|
| Backend framework | NestJS (TypeScript) | Module system, decorators, DI — scales to microservices |
| Relational DB | PostgreSQL 16 + Prisma | Users, games, ratings, tournaments — strong consistency |
| Document DB | MongoDB 7 + Mongoose | Chat, notifications, analysis — flexible schema |
| Cache + queues | Redis 7 + BullMQ | Game rooms, leaderboards, job queues — sub-ms reads |
| Real-time | Socket.io + Redis adapter | Horizontal scaling of WebSocket connections |
| Chess logic | chess.js (server) + Stockfish WASM (browser) | Authoritative server validation; engine runs in-browser |
| Rating system | Glicko-2 (not plain ELO) | Accounts for rating deviation and result confidence |
| Auth | JWT (HS256, 15m) + refresh token rotation | Stateless access, revocable sessions |

---

## Feature Overview

### 01 — Auth
JWT register/login/refresh/logout/me. bcrypt (10 rounds). Refresh tokens stored in PostgreSQL with rotation. `JwtAuthGuard` protects all authenticated routes.

### 02 — Game Engine
Real-time chess over Socket.io. Active game rooms in Redis as JSON (FEN + timers + moves). chess.js validates every move server-side. Clocks maintained server-side (deduct elapsed on each move). On game end: save to PostgreSQL, run Glicko-2, update Redis leaderboard.

### 03 — Matchmaking
Redis List queues per variant. 500ms polling pairs players by rating tolerance (±100→±400). Direct challenge by room link also supported.

### 04 — Stockfish
**Browser:** WASM Web Worker for computer games (5 difficulty levels). **Backend:** BullMQ worker with native Stockfish for deep analysis. Results routed via Redis pub/sub.

### 05 — Leaderboard
Redis sorted sets (`leaderboard:{variant}`) updated on every game end. Top-100 enriched with usernames. Weekly/monthly time-scoped boards.

### 06 — Chat
MongoDB `Message` collection (TTL 30 days). `send_message`, `get_history`, typing indicators. Profanity filter + rate limit.

### 07 — Tournaments
Swiss, Arena, Round Robin, Knockout. Lifecycle: UPCOMING → ONGOING → COMPLETED. BullMQ cron advances rounds.

### 08 — Puzzles
~4M puzzles from Lichess. Glicko-2 puzzle ratings. SM-2 spaced repetition. Daily puzzle cached in Redis 24h.

### 09 — Social
Friendship (bidirectional), follows (one-directional). Online presence via Redis TTL. Activity feed in MongoDB (TTL 90 days).

### 10 — Notifications
MongoDB store. Socket.io real-time delivery. BullMQ email via SendGrid (3/hour/user). Triggers: game result, friend request, tournament, rating milestone.

### 11 — Analysis
BullMQ job → Stockfish depth-18 → move classification (brilliant/good/inaccuracy/mistake/blunder) → accuracy % → ECO opening identification. Stored in MongoDB.

### 12 — Frontend UI
Zustand stores, React Query, sounds, 5 board themes, 4 piece sets, dark/light mode, keyboard shortcuts, mobile layout, lazy-loaded routes, skeleton loaders.

---

## Infrastructure

### Local Dev (3 commands)
```bash
docker compose up -d            # PostgreSQL + MongoDB + Redis
cd backend && npm run start:dev # NestJS on :3000, hot-reload
cd frontend && npm run dev      # React on :5173
```

### Key ports
| Service | Port |
|---|---|
| NestJS API | 3000 |
| Swagger UI | 3000/api/docs |
| React Dev | 5173 |
| PostgreSQL | 5432 |
| MongoDB | 27017 |
| Redis | 6379 |

### Production path
VPS (PM2 + Nginx + Docker Compose) → Managed cloud DBs (Supabase/Atlas/Upstash) → Kubernetes with HPA when needed.

---

## What's Next

Recommended starting point: **fix the gaps in existing modules before opening new ones.**

### Immediate fixes (on `feature/auth` branch)
1. Add `/auth/refresh` and `/auth/logout` using the `RefreshToken` Prisma model
2. Move access token from `localStorage` to memory in `AuthContext`
3. Add auto-refresh interceptor (retry on 401)
4. Add `ProtectedRoute` wrapper

### Then in order
| Branch | Unblocked by |
|---|---|
| `feature/auth` | nothing — start here |
| `feature/game-engine` | auth (board locking, rematch, rating modal) |
| `feature/matchmaking` | game-engine (Lobby page) |
| `feature/stockfish` | game-engine (fix result routing via Redis pub/sub) |
| `feature/leaderboard` | game-engine (add cache + time-scoped boards) |
| `feature/chat` | auth (add typing + rate limit) |
| `feature/tournaments` | matchmaking (pairing algorithms) |
| `feature/puzzles` | auth (SM-2 + Glicko-2 for puzzles) |
| `feature/social` | auth (new module entirely) |
| `feature/notifications` | social (socket gateway + email worker) |
| `feature/analysis` | stockfish + game-engine (new module entirely) |
| `feature/frontend-ui` | all of the above |

Each feature doc (`docs/features/NN-name.md`) contains: file structure, backend spec, frontend spec, full checklist, and verify steps.
