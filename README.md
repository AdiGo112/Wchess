# WChess

A server-authoritative, real-time web chess platform with an in-browser AI
opponent and confidence-based (Glicko-2) ratings.

React + TypeScript · NestJS · PostgreSQL · Redis · Socket.io · Stockfish WASM

> **Status:** v1 core is working end to end — live rated games, server clocks,
> matchmaking, a Stockfish opponent, and leaderboards. Scope was deliberately cut
> to that core by **ADR-0032**; see `docs/FUTURE_SCOPE.md` for what's deferred and
> `docs/CURRENT_SPRINT.md` for what's happening now.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript (strict), Vite, Tailwind, react-chessboard, chess.js, Socket.io client |
| Backend | NestJS (TypeScript), Passport-JWT, class-validator, Swagger, Prisma |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / real-time state | Redis 7 via ioredis (game rooms, queues, leaderboards, clock deadlines) |
| Real-time | Socket.io (single default namespace) |
| Engine (opponent) | Stockfish 18 lite, WASM in a browser Web Worker (ADR-0009) |
| Engine (analysis) | The same WASM build, as a server child process over UCI |
| Infrastructure | Docker Compose (PostgreSQL + Redis) |

MongoDB and BullMQ were **removed** in the v1 scope cut — deleting chat and
notifications removed the only Mongo consumers, and the client-side engine
removed the only queue consumer. Neither is a dependency any more. Post-game
analysis, the one job-shaped workload that came back, runs as a promise chain
over a single out-of-process engine and stores its results in Postgres.

---

## Local Development

### Prerequisites
- Node 20+
- Docker Desktop

### 1. Start databases
```bash
docker compose up -d            # PostgreSQL :5432 + Redis :6379
```

### 2. Backend
```bash
cd backend
cp .env.example .env            # fill in secrets
npm install
npx prisma migrate dev          # creates PostgreSQL tables
npm run start:dev               # http://localhost:3100
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

The frontend proxies `/api` and `/socket.io` to the backend, so it runs
same-origin with no CORS setup. Set `VITE_SERVER_URL` only if you want to point
it at a different backend origin.

**One-port demo:** `npm run build` in `frontend/`, then start the backend — it
serves the built SPA, so the whole app is on `:3100` alone.

### API docs
Swagger UI at `http://localhost:3100/api/docs`.

### Verification scripts
Each feature ships a runnable live end-to-end check (no test framework):
```bash
node frontend/scripts/verify-clocks.mjs        # server clocks, 8/8
node frontend/scripts/verify-leaderboard.mjs   # period boards, 16/16
node frontend/scripts/verify-join-authz.mjs    # join_room authz, 2/2
node frontend/scripts/verify-hardening.mjs     # pre-Inc-2 hardening pass
node backend/scripts/verify-analysis.mjs      # post-game analysis, 14/14
```

---

## Architecture

```
WChess/
├── docker-compose.yml          — PostgreSQL + Redis
├── frontend/                   — React + TypeScript (Vite)
│   ├── scripts/                — live end-to-end verification scripts
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── context/            — AuthContext, SocketContext
│       ├── hooks/              — useStockfish, useMatchmakingSocket
│       ├── utils/
│       ├── api.ts              — axios client + refresh interceptors
│       └── types.ts            — socket + REST contracts
└── backend/                    — NestJS
    ├── prisma/schema.prisma    — PostgreSQL models
    ├── scripts/                — live verification scripts
    └── src/
        ├── auth/               — JWT register/login/refresh/logout
        ├── games/              — game lifecycle + Socket.io gateway + clocks
        ├── matchmaking/        — Redis queue pairing, challenges, vs-computer
        ├── leaderboard/        — Redis sorted sets (all / week / month)
        ├── analysis/           — depth-18 post-game sweep, out-of-process engine
        ├── users/              — profiles, stats, player directory
        └── common/             — Prisma, Redis, Glicko-2, CORS helpers
```

---

## Features (built)

- Real-time multiplayer chess — server-authoritative, Redis game rooms, Lua CAS on every mutation
- Server-side clocks with a 1s Redis ZSET deadline sweeper (ADR-0004)
- Glicko-2 ratings per variant (Bullet / Blitz / Rapid / Classical)
- Matchmaking queue with rating-tolerance relaxation (±50 → ±400, ADR-0008)
- Friend challenges via tokened links, and vs-computer games
- Computer opponent — Stockfish WASM in the player's own browser, 5 difficulties (ADR-0009)
- Leaderboards (all-time / weekly / monthly) via Redis sorted sets, 60s read cache
- Game history with PGN export
- Post-game analysis — depth-18 sweep, per-move classification, per-player accuracy
  (API only; no UI yet)
- Monochrome neo-brutalist UI

## Deferred (ADR-0032)

Tournaments, puzzles, social graph, chat, notifications.
See `docs/FUTURE_SCOPE.md`.

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable code |
| `staging` | Pre-release integration |
| `dev` | Integration branch — features merge here first |
| `feature/*` | One branch per feature, cut from `dev` |

Never commit directly to `main` or `staging`.
