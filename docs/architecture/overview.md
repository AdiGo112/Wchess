# Architecture Overview

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Zustand, React Query, Socket.io-client |
| Backend | NestJS (TypeScript), Socket.io |
| Primary DB | PostgreSQL 16 via Prisma ORM |
| Document DB | MongoDB 7 via Mongoose |
| Cache / Queues | Redis 7 via ioredis |
| Job Queues | BullMQ (Redis-backed) |
| Chess Engine | chess.js (validation), Stockfish WASM (AI) |
| Auth | JWT (HS256), bcrypt, Passport.js |

## Service Map (Current — Monolith)

All modules live inside one NestJS app at `backend/src/`:

```
NestJS App (port 3000)
├── AuthModule          — register, login, JWT
├── UsersModule         — profile, stats
├── GamesModule         — game history, GameGateway (Socket.io)
├── MatchmakingModule   — queue management, MatchmakingGateway
├── StockfishModule     — BullMQ worker, WASM engine
├── LeaderboardModule   — Redis sorted sets
├── ChatModule          — MongoDB messages, ChatGateway
├── TournamentsModule   — Swiss/Arena/Knockout
├── PuzzlesModule       — tactics bank, spaced repetition
└── NotificationsModule — BullMQ fan-out, MongoDB storage
```

## Future — Microservices (from Here_is_THE_plan.md §4)

When traffic demands it, each module becomes its own service:
- auth-service (3001), user-service (3002), game-service (3003/3004)
- matchmaking-service (3005), stockfish-service (3006)
- tournament-service (3007), puzzle-service (3008), analysis-service (3009)
- opening-service (3010), social-service (3011), chat-service (3012/3013)
- notification-service (3014), leaderboard-service (3015)

## Data Flow — Move in a Live Game

```
Browser (Player A)
  │  move { roomId, from, to }  [WebSocket]
  ▼
GameGateway (NestJS)
  │  GET game:room:{roomId}     [Redis]
  │  chess.js.move(from, to)    [in-memory]
  │  SET game:room:{roomId}     [Redis — updated fen, moves, timers]
  ▼  broadcast move_made        [Socket.io room]
Browser (Player A + B)

On game end:
  GamesService.saveGame()       [PostgreSQL via Prisma]
  Glicko-2 recalculate          [in-process]
  ZADD leaderboard:{variant}    [Redis]
  emit game_over + rating_update [Socket.io]
```

## Databases — Who Owns What

| Store | Data |
|---|---|
| PostgreSQL | Users, UserRatings, Games, Tournaments, Puzzles, Friendships |
| MongoDB | Chat messages, Notifications, Game analysis, Studies, Activity feed |
| Redis | Active game rooms, Matchmaking queues, Leaderboards, Online status, Cache |
| BullMQ (Redis) | stockfish jobs, notification jobs, analysis jobs, email jobs |
