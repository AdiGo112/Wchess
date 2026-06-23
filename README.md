# ChessWeb

Production-grade chess platform. React + NestJS + PostgreSQL + MongoDB + Redis + Socket.io + BullMQ + Stockfish.

> **Status:** Active rebuild. See `Here_is_THE_plan.md` for the masterplan and the `plan` branch `docs/` folder for feature specs.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), react-chessboard, chess.js, Zustand, React Query, Socket.io client |
| Backend | NestJS (TypeScript), Passport-JWT, class-validator, Swagger |
| Relational DB | PostgreSQL 16 via Prisma ORM |
| Document DB | MongoDB 7 via Mongoose |
| Cache / Queues | Redis 7 via ioredis + BullMQ |
| Real-time | Socket.io with @socket.io/redis-adapter |
| Engine | Stockfish (WASM Web Worker in browser; native binary for analysis) |
| Infrastructure | Docker Compose (local), PM2 (VPS), Kubernetes (scale) |

---

## Local Development

### Prerequisites
- Node 20+
- Docker Desktop

### 1. Start databases
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
cp .env.example .env          # fill in secrets
npm install
npx prisma migrate dev        # creates PostgreSQL tables
npm run start:dev             # http://localhost:3000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

### API docs
Swagger UI at `http://localhost:3000/api/docs` in development.

---

## Architecture

```
ChessWeb/
├── docker-compose.yml          — PostgreSQL + MongoDB + Redis
├── frontend/                   — React (Vite)
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── store/              — Zustand stores
│       ├── api/                — React Query hooks
│       └── workers/            — Stockfish Web Worker
└── backend/                    — NestJS
    ├── prisma/schema.prisma    — PostgreSQL models
    └── src/
        ├── auth/               — JWT register/login/refresh
        ├── games/              — game lifecycle + Socket.io gateway
        ├── matchmaking/        — BullMQ queue pairing
        ├── stockfish/          — BullMQ analysis worker
        ├── chat/               — MongoDB messages + gateway
        ├── notifications/      — MongoDB + BullMQ email
        ├── leaderboard/        — Redis sorted sets
        ├── tournaments/        — Swiss/Arena/RoundRobin/KO
        ├── puzzles/            — Lichess puzzle bank + spaced repetition
        └── social/             — friends, follows, activity feed
```

---

## Features

- Real-time multiplayer chess (WebSockets, Redis game rooms)
- Glicko-2 ratings per variant (Bullet / Blitz / Rapid / Classical)
- Matchmaking queue with rating-tolerance relaxation
- Computer opponent (Stockfish, 5 difficulty levels)
- Post-game computer analysis with move classification
- Leaderboards (live, weekly, monthly) via Redis sorted sets
- Tournaments: Swiss, Arena, Round Robin, Knockout
- Puzzles with spaced repetition and Glicko-2 puzzle ratings
- In-game chat (MongoDB), real-time notifications (Socket.io + email)
- Friend system, follow graph, online presence, activity feed
- Dark/light themes, board themes, sound effects

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable code |
| `plan` | Architecture docs (`docs/`) — no executable code |
| `feature/*` | One branch per feature, merged to main when complete |

## Implementation Order

1. `feature/auth` — JWT register/login/refresh/me
2. `feature/game-engine` — live chess, Redis rooms, Glicko-2
3. `feature/matchmaking` — queue pairing, BullMQ
4. `feature/stockfish` — WASM browser worker + backend analysis
5. `feature/leaderboard` — Redis sorted sets
6. `feature/chat` — MongoDB messages, Socket.io
7. `feature/tournaments` — Swiss/Arena/RR/KO
8. `feature/puzzles` — Lichess import, spaced repetition
9. `feature/social` — friends, follows, activity feed
10. `feature/notifications` — socket delivery, email via BullMQ
11. `feature/analysis` — depth-18 eval, move classification
12. `feature/frontend-ui` — Zustand, React Query, polish
