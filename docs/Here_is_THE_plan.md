# ChessWeb — Complete Architecture Reference
### Production platform designed for 11M+ concurrent users

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Monorepo Layout](#2-monorepo-layout)
3. [Frontend Structure](#3-frontend-structure)
4. [Backend Services](#4-backend-services)
5. [REST APIs](#5-rest-apis)
6. [WebSocket Events](#6-websocket-events)
7. [PostgreSQL Schemas (Prisma)](#7-postgresql-schemas-prisma)
8. [Redis Keys & Data Structures](#8-redis-keys--data-structures)
9. [Authentication & JWT Flow](#9-authentication--jwt-flow)
10. [Matchmaking](#10-matchmaking)
11. [Game Lifecycle](#11-game-lifecycle)
12. [Stockfish Workers](#12-stockfish-workers)
13. [PGN Storage](#13-pgn-storage)
14. [Rating System (Elo + Glicko-2)](#14-rating-system-elo--glicko-2)
15. [Tournament Architecture](#15-tournament-architecture)
16. [Friends & Social Features](#16-friends--social-features)
17. [Chat Service](#17-chat-service)
18. [Notifications](#18-notifications)
19. [Leaderboards](#19-leaderboards)
20. [Spectator Mode](#20-spectator-mode)
21. [Puzzle System](#21-puzzle-system)
22. [Opening Explorer](#22-opening-explorer)
23. [Analysis Board](#23-analysis-board)
24. [Studies](#24-studies)
25. [AI Coach](#25-ai-coach)
26. [File Uploads & CDN](#26-file-uploads--cdn)
27. [Logging](#27-logging)
28. [Metrics & Monitoring](#28-metrics--monitoring)
29. [Docker Setup](#29-docker-setup)
30. [Kubernetes Layout](#30-kubernetes-layout)
31. [CI/CD Pipeline](#31-cicd-pipeline)
32. [Testing Strategy](#32-testing-strategy)
33. [Scaling to 11M+ Users](#33-scaling-to-11m-users)
34. [Security](#34-security)
35. [Rate Limiting](#35-rate-limiting)
36. [Event Queues (BullMQ + Kafka)](#36-event-queues-bullmq--kafka)
37. [Cron Jobs](#37-cron-jobs)
38. [CDN Strategy](#38-cdn-strategy)
39. [ER Diagrams](#39-er-diagrams)
40. [Sequence Diagrams](#40-sequence-diagrams)
41. [Environment Variables](#41-environment-variables)
42. [DTOs](#42-dtos)
43. [Error Codes](#43-error-codes)
44. [Deployment Architecture](#44-deployment-architecture)
45. [Redis Pub/Sub Channels](#45-redis-pubsub-channels)
46. [Kafka Events (Future Scale)](#46-kafka-events-future-scale)
47. [Read Replicas & Caching Strategies](#47-read-replicas--caching-strategies)
48. [Disaster Recovery](#48-disaster-recovery)
49. [Future Features](#49-future-features)

---

## 1. System Architecture Overview

At 11M+ users the system must be horizontally scalable, fault-tolerant, and independently deployable by domain. A microservices architecture with an API Gateway front door is required.

```
                          ┌──────────────────────┐
                          │      Cloudflare CDN  │
                          │  (static, PGN, media)│
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │    Load Balancer      │
                          │   (nginx / AWS ALB)   │
                          └──────────┬────────────┘
                                     │
                          ┌──────────▼────────────┐
                          │     API Gateway        │
                          │  (Kong / nginx)        │
                          │  rate-limit, auth-check│
                          └──┬──────────────┬──────┘
                             │              │
              ┌──────────────▼──┐    ┌──────▼──────────────┐
              │  REST Services  │    │  WebSocket Services  │
              │  (HTTP/2)       │    │  (Socket.io cluster) │
              └──┬──────────────┘    └──────┬───────────────┘
                 │                          │
    ┌────────────▼──────────────────────────▼────────────────┐
    │                   Internal Service Mesh                  │
    │              (gRPC + Kafka event bus)                    │
    └────────────────────────────────────────────────────────┘
         │           │           │           │          │
    ┌────▼───┐ ┌─────▼──┐ ┌─────▼──┐ ┌─────▼──┐ ┌────▼────┐
    │  auth  │ │  user  │ │  game  │ │ match  │ │stockfish│
    │service │ │service │ │service │ │service │ │ workers │
    └────┬───┘ └─────┬──┘ └─────┬──┘ └─────┬──┘ └─────────┘
         │           │           │           │
    ┌────▼───────────▼───────────▼───────────▼────────────────┐
    │                      Data Layer                           │
    │  PostgreSQL   MongoDB    Redis Cluster   Elasticsearch    │
    │  (+ replicas) (sharded)  (6 nodes)       (3 nodes)       │
    │                          S3/MinIO        ClickHouse       │
    └────────────────────────────────────────────────────────┘
```

**Core principle:** Each service owns its own database. Cross-service reads go through the API, cross-service events go through Kafka.

---

## 2. Monorepo Layout

Managed with **Turborepo** (build caching) + **pnpm workspaces**.

```
chessweb/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── docker-compose.yml              ← local dev (all infra)
├── docker-compose.prod.yml         ← prod-like local test
│
├── apps/
│   ├── web/                        ← React frontend (Vite)
│   ├── api-gateway/                ← Kong config / nginx reverse proxy
│   ├── auth-service/               ← NestJS
│   ├── user-service/               ← NestJS
│   ├── game-service/               ← NestJS + Socket.io
│   ├── matchmaking-service/        ← NestJS + BullMQ
│   ├── stockfish-service/          ← NestJS + BullMQ workers
│   ├── tournament-service/         ← NestJS
│   ├── puzzle-service/             ← NestJS
│   ├── analysis-service/           ← NestJS (async, heavy CPU)
│   ├── opening-service/            ← NestJS + Elasticsearch
│   ├── social-service/             ← NestJS (friends, follows)
│   ├── chat-service/               ← NestJS + MongoDB
│   ├── notification-service/       ← NestJS + MongoDB + BullMQ
│   ├── leaderboard-service/        ← NestJS + Redis
│   ├── study-service/              ← NestJS + MongoDB
│   ├── media-service/              ← NestJS + S3
│   └── search-service/             ← NestJS + Elasticsearch
│
├── packages/
│   ├── chess-engine/               ← shared chess.js wrapper, move validation
│   ├── elo/                        ← shared ELO / Glicko-2 calculation
│   ├── pgn-parser/                 ← shared PGN parse/stringify
│   ├── dto/                        ← shared TypeScript DTOs (Zod schemas)
│   ├── prisma/                     ← shared Prisma client + schema
│   ├── config/                     ← shared env validation (Zod)
│   ├── logger/                     ← shared Pino logger wrapper
│   └── ui/                         ← shared React component library
│
├── infra/
│   ├── k8s/                        ← Kubernetes manifests
│   ├── helm/                       ← Helm charts per service
│   ├── terraform/                  ← AWS/GCP IaC
│   └── grafana/                    ← dashboard definitions
│
└── scripts/
    ├── seed.ts
    ├── migrate-all.sh
    └── health-check.sh
```

---

## 3. Frontend Structure

**Stack:** React 18, Vite, TypeScript, Tailwind CSS, Zustand (state), React Query (server state), Socket.io-client, react-chessboard, chess.js

```
apps/web/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── public/
│   ├── sounds/          ← move.mp3, capture.mp3, check.mp3, game-end.mp3
│   └── pieces/          ← custom piece SVGs (optional)
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── router.tsx        ← React Router v6 routes
    │
    ├── store/            ← Zustand slices
    │   ├── auth.store.ts
    │   ├── game.store.ts
    │   ├── ui.store.ts
    │   └── notification.store.ts
    │
    ├── api/              ← React Query hooks wrapping axios
    │   ├── client.ts     ← axios instance with JWT interceptor
    │   ├── auth.ts
    │   ├── games.ts
    │   ├── users.ts
    │   ├── leaderboard.ts
    │   ├── puzzles.ts
    │   ├── tournaments.ts
    │   └── social.ts
    │
    ├── socket/
    │   ├── socket.ts          ← singleton io() connection
    │   ├── useGameSocket.ts   ← game events hook
    │   └── useChatSocket.ts   ← chat events hook
    │
    ├── workers/
    │   └── stockfish.worker.ts  ← Web Worker for vs-computer mode
    │
    ├── components/
    │   ├── board/
    │   │   ├── ChessBoard.tsx
    │   │   ├── MoveHistory.tsx
    │   │   ├── Timer.tsx
    │   │   ├── EvalBar.tsx
    │   │   └── AnalysisArrows.tsx
    │   ├── layout/
    │   │   ├── Navbar.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── Footer.tsx
    │   ├── game/
    │   │   ├── GameControls.tsx
    │   │   ├── PlayerInfo.tsx
    │   │   ├── DrawOfferModal.tsx
    │   │   └── GameOverModal.tsx
    │   ├── chat/
    │   │   └── ChatPanel.tsx
    │   ├── ui/              ← buttons, modals, badges (from packages/ui)
    │   └── notifications/
    │       └── NotificationBell.tsx
    │
    └── pages/
        ├── Home.tsx
        ├── Game.tsx          ← /game/:roomId
        ├── Analysis.tsx      ← /analysis
        ├── Puzzles.tsx
        ├── PuzzlePlay.tsx    ← /puzzle/:id
        ├── Tournaments.tsx
        ├── TournamentDetail.tsx
        ├── Leaderboard.tsx
        ├── Profile.tsx       ← /profile/:username
        ├── GameHistory.tsx
        ├── Study.tsx
        ├── Opening.tsx
        ├── Login.tsx
        ├── Signup.tsx
        └── Settings.tsx
```

---

## 4. Backend Services

Each service is a **NestJS** application with its own `package.json`, `Dockerfile`, and Prisma/Mongoose schemas where applicable.

### 4.1 auth-service (port 3001)
Owns: JWT issuance, refresh tokens, OAuth (Google/GitHub), email verification, password reset.
DB: PostgreSQL (`users`, `refresh_tokens`, `email_verifications`).

### 4.2 user-service (port 3002)
Owns: user profile, avatar, settings, stats aggregation.
DB: PostgreSQL (`user_profiles`, `user_settings`). Redis cache for profile reads.

### 4.3 game-service (port 3003 REST + 3004 WS)
Owns: active game rooms, move processing, game records.
DB: PostgreSQL (`games`, `game_moves`). Redis for active room state.

### 4.4 matchmaking-service (port 3005)
Owns: queue management, player pairing, room creation.
DB: Redis only (queues + room bootstrap). Emits Kafka event `game.created`.

### 4.5 stockfish-service (port 3006)
Owns: CPU-heavy Stockfish analysis. Stateless BullMQ workers.
No DB. Reads FEN from job payload, responds via Redis pub/sub.

### 4.6 tournament-service (port 3007)
Owns: tournament lifecycle, pairings (Swiss/Round Robin), standings.
DB: PostgreSQL (`tournaments`, `tournament_players`, `tournament_rounds`, `tournament_games`).

### 4.7 puzzle-service (port 3008)
Owns: puzzle bank, user attempts, spaced-repetition scheduling.
DB: PostgreSQL (`puzzles`, `puzzle_attempts`, `puzzle_themes`).

### 4.8 analysis-service (port 3009)
Owns: post-game analysis jobs (full-game Stockfish eval), annotation storage.
DB: MongoDB (`analyses`, `annotations`). Heavy CPU; runs on separate node pool.

### 4.9 opening-service (port 3010)
Owns: opening name lookup, tree traversal, statistics from master games.
DB: Elasticsearch (indexed PGN moves). PostgreSQL for ECO codes.

### 4.10 social-service (port 3011)
Owns: friend requests, followers, blocks, activity feed.
DB: PostgreSQL (`friendships`, `follows`, `blocks`). Redis for online-status.

### 4.11 chat-service (port 3012 REST + 3013 WS)
Owns: game chat, lobby chat, DMs.
DB: MongoDB (`messages`, `rooms`).

### 4.12 notification-service (port 3014)
Owns: in-app notifications, email delivery, push (FCM/APNS).
DB: MongoDB (`notifications`). BullMQ for fan-out. Kafka consumer.

### 4.13 leaderboard-service (port 3015)
Owns: global + time-scoped leaderboards.
DB: Redis sorted sets (live). PostgreSQL snapshots (weekly/monthly).

### 4.14 study-service (port 3016)
Owns: user-created studies, shared boards, collaborative annotation.
DB: MongoDB (`studies`, `chapters`, `comments`).

### 4.15 media-service (port 3017)
Owns: avatar uploads, image resizing, S3 management.
DB: PostgreSQL (`media_files`). S3/MinIO for binary storage.

### 4.16 search-service (port 3018)
Owns: full-text search across games, users, studies, puzzles.
DB: Elasticsearch.

---

## 5. REST APIs

All routes prefixed `/api/v1/`. API Gateway routes by hostname prefix or path prefix.

### Auth Service
```
POST   /api/v1/auth/register          body: RegisterDto
POST   /api/v1/auth/login             body: LoginDto → { accessToken, refreshToken }
POST   /api/v1/auth/refresh           body: { refreshToken } → { accessToken }
POST   /api/v1/auth/logout            header: Bearer token
POST   /api/v1/auth/forgot-password   body: { email }
POST   /api/v1/auth/reset-password    body: { token, newPassword }
POST   /api/v1/auth/verify-email      body: { token }
GET    /api/v1/auth/me                header: Bearer token → UserDto
POST   /api/v1/auth/oauth/google      body: { idToken }
POST   /api/v1/auth/oauth/github      body: { code }
```

### User Service
```
GET    /api/v1/users/:username              → PublicProfileDto
PATCH  /api/v1/users/me                     body: UpdateProfileDto
GET    /api/v1/users/:username/stats        → StatsDto
GET    /api/v1/users/search?q=              → UserDto[]
```

### Game Service
```
GET    /api/v1/games/:id                    → GameDto
GET    /api/v1/games/history/:userId        query: page, limit, result → GameDto[]
POST   /api/v1/games/challenge              body: ChallengeDto
GET    /api/v1/games/live                   → LiveGamesDto[] (for lobby)
```

### Tournament Service
```
GET    /api/v1/tournaments                  query: status, type → TournamentDto[]
POST   /api/v1/tournaments                  body: CreateTournamentDto  [admin]
GET    /api/v1/tournaments/:id
POST   /api/v1/tournaments/:id/join
POST   /api/v1/tournaments/:id/leave
GET    /api/v1/tournaments/:id/standings
GET    /api/v1/tournaments/:id/rounds/:num
```

### Puzzle Service
```
GET    /api/v1/puzzles/daily
GET    /api/v1/puzzles/next             ← spaced-repetition next puzzle for user
GET    /api/v1/puzzles/:id
POST   /api/v1/puzzles/:id/attempt      body: { moves: string[] }
GET    /api/v1/puzzles/themes           → ThemeDto[]
GET    /api/v1/puzzles?theme=&rating=   query filter
```

### Leaderboard Service
```
GET    /api/v1/leaderboard              query: type (bullet/blitz/rapid/classical), period (all/week/month) → LeaderboardEntryDto[]
GET    /api/v1/leaderboard/rank/:userId
```

### Social Service
```
POST   /api/v1/friends/request/:targetId
POST   /api/v1/friends/accept/:requestId
POST   /api/v1/friends/decline/:requestId
DELETE /api/v1/friends/:friendId
GET    /api/v1/friends                  → FriendDto[]
GET    /api/v1/friends/requests/pending
POST   /api/v1/follow/:userId
DELETE /api/v1/follow/:userId
GET    /api/v1/activity-feed            → ActivityDto[]
```

### Opening Service
```
GET    /api/v1/openings?fen=            → OpeningDto (name, ECO, continuation stats)
GET    /api/v1/openings/:eco
GET    /api/v1/openings/moves?fen=      → NextMoveStatsDto[]
```

### Analysis Service
```
POST   /api/v1/analysis/game/:gameId    → 202 Accepted, jobId
GET    /api/v1/analysis/game/:gameId    → AnalysisDto (or 202 if still running)
POST   /api/v1/analysis/position        body: { fen, depth, multipv } → EvalDto
```

### Study Service
```
POST   /api/v1/studies
GET    /api/v1/studies/:id
PATCH  /api/v1/studies/:id
DELETE /api/v1/studies/:id
POST   /api/v1/studies/:id/chapters
PATCH  /api/v1/studies/:id/chapters/:chapterId
GET    /api/v1/studies/public           query: page
```

### Media Service
```
POST   /api/v1/media/avatar             multipart/form-data → { url }
DELETE /api/v1/media/avatar
```

### Chat Service
```
GET    /api/v1/chat/rooms/:roomId/history  query: before (cursor) → MessageDto[]
```

---

## 6. WebSocket Events

All WebSocket connections go through **game-service** (game events) and **chat-service** (chat). Clients authenticate the socket connection by passing the JWT in the handshake auth header: `{ auth: { token: "Bearer ..." } }`.

### Game Gateway Events

**Client → Server**
```typescript
join_queue       { timeControl: number; variant: 'standard'|'960' }
leave_queue      {}
join_room        { roomId: string }
move             { roomId: string; from: string; to: string; promotion?: string }
resign           { roomId: string }
offer_draw       { roomId: string }
accept_draw      { roomId: string }
decline_draw     { roomId: string }
claim_timeout    { roomId: string }
request_takeback { roomId: string }
accept_takeback  { roomId: string }
decline_takeback { roomId: string }
premove          { roomId: string; from: string; to: string; promotion?: string }
spectate         { roomId: string }
```

**Server → Client**
```typescript
queued           { position: number; estimatedWait: number }
match_found      { roomId: string; opponent: UserDto; color: 'white'|'black' }
game_start       { roomId: string; white: UserDto; black: UserDto; fen: string; timeControl: number }
move_made        { roomId: string; move: MoveDto; fen: string; timers: TimerDto; check: boolean }
game_over        { roomId: string; result: 'white'|'black'|'draw'; reason: string; ratingChange: RatingChangeDto }
draw_offered     { roomId: string; byColor: 'white'|'black' }
draw_declined    { roomId: string }
takeback_requested { roomId: string; byColor: 'white'|'black' }
takeback_accepted  { roomId: string; fen: string; moves: string[] }
takeback_declined  { roomId: string }
opponent_disconnected { roomId: string; grace: number }
opponent_reconnected  { roomId: string }
clock_sync       { roomId: string; timers: TimerDto; serverTime: number }
invalid_move     { roomId: string; reason: string }
spectator_count  { roomId: string; count: number }
```

### Chat Gateway Events

**Client → Server**
```typescript
send_message     { roomId: string; text: string }
get_history      { roomId: string; before?: string }
typing_start     { roomId: string }
typing_stop      { roomId: string }
```

**Server → Client**
```typescript
message          { roomId: string; message: MessageDto }
history          { roomId: string; messages: MessageDto[]; hasMore: boolean }
typing           { roomId: string; username: string }
```

### Notification Gateway Events (notification-service)

**Server → Client**
```typescript
notification     { id: string; type: string; data: object; createdAt: string }
notification_read { id: string }
```

---

## 7. PostgreSQL Schemas (Prisma)

Shared Prisma schema in `packages/prisma/schema.prisma`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── AUTH ────────────────────────────────────────────────

model User {
  id              String   @id @default(cuid())
  email           String   @unique
  username        String   @unique
  name            String
  passwordHash    String?
  oauthProvider   String?  // "google" | "github"
  oauthId         String?
  emailVerified   Boolean  @default(false)
  avatarUrl       String?
  bio             String?
  country         String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastSeenAt      DateTime?
  isActive        Boolean  @default(true)
  isBanned        Boolean  @default(false)
  banReason       String?
  role            Role     @default(USER)

  ratings         UserRating[]
  gamesAsWhite    Game[]         @relation("WhitePlayer")
  gamesAsBlack    Game[]         @relation("BlackPlayer")
  puzzleAttempts  PuzzleAttempt[]
  tournaments     TournamentPlayer[]
  refreshTokens   RefreshToken[]

  @@index([username])
  @@index([email])
}

enum Role {
  USER
  MODERATOR
  ADMIN
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
}

// ─── RATINGS ─────────────────────────────────────────────

model UserRating {
  id           String       @id @default(cuid())
  userId       String
  variant      TimeVariant
  rating       Int          @default(1200)
  ratingDeviation Float     @default(350)  // Glicko-2 RD
  volatility   Float        @default(0.06) // Glicko-2 σ
  wins         Int          @default(0)
  losses       Int          @default(0)
  draws        Int          @default(0)
  provisional  Boolean      @default(true)
  updatedAt    DateTime     @updatedAt
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, variant])
  @@index([variant, rating(sort: Desc)])
}

enum TimeVariant {
  BULLET     // < 3 min
  BLITZ      // 3-10 min
  RAPID      // 10-30 min
  CLASSICAL  // 30+ min
  CORRESPONDENCE
  PUZZLE
}

// ─── GAMES ───────────────────────────────────────────────

model Game {
  id              String     @id @default(cuid())
  whiteId         String?
  blackId         String?
  whiteUsername   String
  blackUsername   String
  whiteRating     Int
  blackRating     Int
  whiteRatingDiff Int        @default(0)
  blackRatingDiff Int        @default(0)
  result          GameResult
  reason          GameReason
  variant         TimeVariant
  timeControl     Int        // seconds per side
  increment       Int        @default(0)
  pgn             String     // full PGN string
  fen             String?    // final FEN
  moves           String[]   // SAN array
  duration        Int?       // actual seconds
  openingEco      String?
  openingName     String?
  tournamentId    String?
  createdAt       DateTime   @default(now())

  whitePlayer     User?      @relation("WhitePlayer", fields: [whiteId], references: [id])
  blackPlayer     User?      @relation("BlackPlayer", fields: [blackId], references: [id])
  tournament      Tournament? @relation(fields: [tournamentId], references: [id])

  @@index([whiteId, createdAt(sort: Desc)])
  @@index([blackId, createdAt(sort: Desc)])
  @@index([tournamentId])
  @@index([createdAt(sort: Desc)])
}

enum GameResult {
  WHITE
  BLACK
  DRAW
  ABORTED
}

enum GameReason {
  CHECKMATE
  RESIGNATION
  TIMEOUT
  STALEMATE
  AGREEMENT
  INSUFFICIENT_MATERIAL
  THREEFOLD_REPETITION
  FIFTY_MOVE
  ABANDONED
}

// ─── TOURNAMENTS ─────────────────────────────────────────

model Tournament {
  id           String            @id @default(cuid())
  name         String
  description  String?
  format       TournamentFormat
  status       TournamentStatus  @default(UPCOMING)
  variant      TimeVariant
  timeControl  Int
  increment    Int               @default(0)
  rounds       Int               @default(7)
  maxPlayers   Int               @default(64)
  minRating    Int?
  maxRating    Int?
  startAt      DateTime
  endAt        DateTime?
  createdBy    String
  createdAt    DateTime          @default(now())

  players      TournamentPlayer[]
  roundPairings TournamentRound[]
  games        Game[]
}

enum TournamentFormat {
  SWISS
  ROUND_ROBIN
  KNOCKOUT
  ARENA
}

enum TournamentStatus {
  UPCOMING
  ONGOING
  COMPLETED
  CANCELLED
}

model TournamentPlayer {
  id           String     @id @default(cuid())
  tournamentId String
  userId       String
  score        Float      @default(0)
  tiebreak     Float      @default(0)
  rank         Int?
  joinedAt     DateTime   @default(now())

  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  user         User       @relation(fields: [userId], references: [id])

  @@unique([tournamentId, userId])
}

model TournamentRound {
  id           String   @id @default(cuid())
  tournamentId String
  roundNumber  Int
  status       String   @default("pending")
  createdAt    DateTime @default(now())

  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  pairings     TournamentPairing[]
}

model TournamentPairing {
  id         String @id @default(cuid())
  roundId    String
  whiteId    String
  blackId    String
  gameId     String?

  round      TournamentRound @relation(fields: [roundId], references: [id])
}

// ─── PUZZLES ─────────────────────────────────────────────

model Puzzle {
  id          String   @id @default(cuid())
  fen         String
  moves       String[] // correct solution moves (UCI)
  rating      Int      @default(1500)
  ratingDeviation Float @default(200)
  popularity  Int      @default(0)
  plays       Int      @default(0)
  themes      String[] // ["fork", "pin", "discoveredAttack"]
  openingEco  String?
  gameUrl     String?
  createdAt   DateTime @default(now())

  attempts    PuzzleAttempt[]

  @@index([rating])
  @@index([themes])
}

model PuzzleAttempt {
  id        String   @id @default(cuid())
  userId    String
  puzzleId  String
  solved    Boolean
  timeMs    Int
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  puzzle    Puzzle   @relation(fields: [puzzleId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
}

// ─── SOCIAL ──────────────────────────────────────────────

model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@unique([requesterId, addresseeId])
  @@index([addresseeId, status])
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())

  @@id([followerId, followingId])
}
```

---

## 8. Redis Keys & Data Structures

### Active Game Rooms
```
KEY   game:room:{roomId}         TYPE: JSON string
TTL   86400 (24h)
VALUE:
{
  "id": "room_abc",
  "whitePlayer": { "id": "uid1", "username": "alice", "rating": 1400 },
  "blackPlayer":  { "id": "uid2", "username": "bob",   "rating": 1350 },
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "moves": ["e4"],
  "timers": { "white": 598400, "black": 600000 },
  "lastMoveAt": 1719000000000,
  "status": "active",
  "timeControl": 600,
  "increment": 0,
  "startedAt": 1719000000000,
  "drawOfferedBy": null,
  "spectators": 3
}
```

### Matchmaking Queues
```
KEY   queue:bullet          TYPE: List (LPUSH / RPOP)
KEY   queue:blitz           TYPE: List
KEY   queue:rapid           TYPE: List
KEY   queue:classical       TYPE: List

Each list element:
{
  "userId": "uid1",
  "username": "alice",
  "rating": 1400,
  "socketId": "socket_xyz",
  "joinedAt": 1719000000000
}
```

### Leaderboards (sorted sets by variant)
```
KEY   leaderboard:bullet         TYPE: ZSET  score=rating  member=userId
KEY   leaderboard:blitz          TYPE: ZSET
KEY   leaderboard:rapid          TYPE: ZSET
KEY   leaderboard:classical      TYPE: ZSET
KEY   leaderboard:week:blitz     TYPE: ZSET  (refreshed weekly via cron)
KEY   leaderboard:month:blitz    TYPE: ZSET
```

### Online Status
```
KEY   online:{userId}            TYPE: string "1"
TTL   30 (refreshed by heartbeat every 15s)
```

### Session Cache
```
KEY   session:{userId}           TYPE: JSON string (cached user object)
TTL   300 (5 min)
```

### Rate Limiting
```
KEY   ratelimit:{ip}:{endpoint}  TYPE: integer (INCR / EXPIRE)
KEY   ratelimit:user:{userId}:{endpoint}
```

### Socket-to-User Mapping
```
KEY   socket:{socketId}          TYPE: string → userId
KEY   user:socket:{userId}       TYPE: string → socketId  (latest)
```

### Spectator Sets
```
KEY   spectators:{roomId}        TYPE: Set of socketIds
```

### BullMQ queues (use ioredis under the hood)
```
bull:matchmaking:{jobId}
bull:stockfish:{jobId}
bull:notifications:{jobId}
bull:analysis:{jobId}
bull:email:{jobId}
```

---

## 9. Authentication & JWT Flow

```
┌─────────┐         ┌─────────────┐         ┌────────────┐
│ Client  │         │ auth-service│         │ PostgreSQL │
└────┬────┘         └──────┬──────┘         └─────┬──────┘
     │  POST /auth/login   │                      │
     │ ──────────────────► │                      │
     │                     │  SELECT user WHERE   │
     │                     │  username=...        │
     │                     │ ────────────────────►│
     │                     │ ◄────────────────────│
     │                     │  bcrypt.compare()    │
     │                     │                      │
     │  { accessToken,     │                      │
     │    refreshToken }   │                      │
     │ ◄────────────────── │                      │
     │                     │                      │
     │  GET /api/v1/games  │                      │
     │  Authorization:     │                      │
     │  Bearer <access>    │                      │
     │ ──────────────────► API Gateway            │
     │                     │  verify JWT (RS256)  │
     │                     │  (no DB hit)         │
     │                     │  forward + inject    │
     │                     │  x-user-id header    │
     │                     │ ──────────────────►  game-service
```

**Token strategy:**
- `accessToken`: RS256 JWT, 15-minute expiry. Payload: `{ sub: userId, username, role, iat, exp }`.
- `refreshToken`: opaque random string (UUID v4), stored in PostgreSQL `refresh_tokens` table, 30-day expiry.
- API Gateway validates access tokens using the auth-service's public key (fetched on startup from `GET /api/v1/auth/.well-known/jwks.json`). No DB hit on every request.
- Refresh flow: client calls `POST /auth/refresh` → auth-service checks DB → issues new access + refresh token (rotation).

**OAuth flow (Google):**
1. Client gets Google `idToken` via `@react-oauth/google`.
2. Sends to `POST /auth/oauth/google`.
3. auth-service verifies `idToken` with Google's JWKS.
4. Upsert user, issue our own JWT pair.

---

## 10. Matchmaking

```
Player A joins queue                    Player B joins queue
        │                                       │
        ▼                                       ▼
matchmaking-service                   matchmaking-service
LPUSH queue:blitz {A}                LPUSH queue:blitz {B}
emit → Client: queued                emit → Client: queued
        │                                       │
        └───────────── BullMQ repeatable job (every 500ms) ──────────────┘
                                       │
                              Pop 2 from queue
                              Check rating diff ≤ 300 (relaxes over time)
                              if matched:
                                create roomId = nanoid()
                                SET game:room:{roomId} (Redis, JSON)
                                emit match_found → both socket IDs
                                publish Kafka: game.created
```

**Rating tolerance relaxation:** starts at ±100, widens by +50 every 10 seconds of waiting, caps at ±400.

**Direct challenge:** skip queue entirely — `POST /api/v1/games/challenge` creates a pending room, sends notification to target. Target accepts → room activates.

---

## 11. Game Lifecycle

```
CREATED (room in Redis, status="waiting")
   │
   ▼ both players join_room
ACTIVE (status="active")
   │
   ├─► moves exchanged via socket
   │   each move: validate with chess.js, update Redis room
   │   clock: server-authoritative; client displays countdown
   │
   ├─► disconnect handling
   │   grace period 60s → if not reconnected → claim_timeout available
   │
   ▼ terminal event (checkmate / resign / timeout / draw / stalemate)
ENDING
   │
   ├─► GamesService.saveGame() → write to PostgreSQL
   ├─► ELO/Glicko-2 recalculate → update UserRating in PostgreSQL
   ├─► ZADD leaderboard:{variant} → update Redis leaderboard
   ├─► emit game_over to both players (and spectators)
   ├─► Kafka publish game.completed
   ├─► DELETE game:room:{roomId} from Redis
   └─► queue notification jobs (BullMQ)
COMPLETED (record in PostgreSQL only)
```

---

## 12. Stockfish Workers

**stockfish-service** runs a pool of BullMQ workers; each worker spawns a Stockfish subprocess (native binary on Linux, not WASM, for performance).

```typescript
// Job payload
interface StockfishJob {
  fen: string;
  movetime?: number;   // ms for vs-computer
  depth?: number;      // for analysis
  multipv?: number;    // lines for analysis (default 1)
  roomId?: string;     // for vs-computer response routing
  userId?: string;     // for analysis response routing
}

// Worker logic (simplified)
const worker = new Worker('stockfish', async (job) => {
  const engine = await StockfishPool.acquire();
  engine.send(`position fen ${job.data.fen}`);
  engine.send(`go movetime ${job.data.movetime ?? 1000}`);
  const bestmove = await engine.waitForBestmove();
  await StockfishPool.release(engine);

  // Route result
  if (job.data.roomId) {
    await redis.publish(`stockfish:result:${job.data.roomId}`, bestmove);
  } else {
    await redis.publish(`analysis:result:${job.data.userId}`, JSON.stringify(eval));
  }
});
```

**Difficulty levels (vs computer):**
| Level | movetime | depth cap |
|---|---|---|
| Beginner | 50ms | 5 |
| Easy | 200ms | 10 |
| Medium | 1000ms | 15 |
| Hard | 3000ms | 20 |
| Master | 5000ms | unlimited |

**Frontend vs-computer mode:** uses a Stockfish WASM Web Worker (`stockfish.js` npm) — no backend required for local computer games. Backend Stockfish is used for tournament vs-computer games and post-game analysis.

**Scaling:** Deploy stockfish-service on CPU-optimized nodes. One worker process per CPU core. Kubernetes HPA scales on BullMQ queue depth.

---

## 13. PGN Storage

PGN is the authoritative game record.

**Structure of a stored PGN:**
```pgn
[Event "Casual Blitz Game"]
[Site "chessweb.com"]
[Date "2026.06.23"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[WhiteElo "1420"]
[BlackElo "1385"]
[TimeControl "300+0"]
[ECO "C50"]
[Opening "Italian Game"]
[Termination "Normal"]
[TimeSpent "white:183 black:241"]

1. e4 { [%clk 5:00] } 1... e5 { [%clk 5:00] } 2. Nf3 { [%clk 4:58] } ...
1-0
```

**Storage tiers:**
1. **Hot (PostgreSQL `games.pgn`):** Last 90 days, fast access for profile/history pages.
2. **Warm (S3/MinIO `pgn/{year}/{month}/{gameId}.pgn`):** All games archived as individual files.
3. **Cold (S3 Glacier `pgn-archive/{year}.pgn.zst`):** Monthly bulk archives (zstd compressed), for the opening explorer dataset.

**PGN generation:** `packages/pgn-parser` handles PGN construction from `moves[]` array with clock annotations, opening tag injection, and result formatting.

---

## 14. Rating System (Elo + Glicko-2)

**Glicko-2 is used** (superior to plain Elo — accounts for rating reliability).

Parameters stored per `UserRating`: `rating r`, `rating deviation RD`, `volatility σ`.

```typescript
// packages/elo/glicko2.ts
export function updateRatings(
  player: { r: number; rd: number; sigma: number },
  opponent: { r: number; rd: number },
  score: 0 | 0.5 | 1   // 0=loss, 0.5=draw, 1=win
): { r: number; rd: number; sigma: number } {
  // Full Glicko-2 algorithm implementation
  // Step 1: Convert to Glicko-2 scale
  // Step 2: Compute g(RD), E(s|r,r_j,RD_j)
  // Step 3: Update v (variance), delta (improvement)
  // Step 4: Update σ (volatility) via Illinois algorithm
  // Step 5: Update RD
  // Step 6: Update rating
  // Step 7: Convert back to Glicko-1 scale
}
```

**Rating period:** Ratings update immediately after each rated game (not batch — simpler for live systems).

**Provisional rating:** `rd > 110` → provisional. Shown with "?" in UI. After 20+ games, RD stabilizes below 110.

**Variants are rated independently:** `bullet`, `blitz`, `rapid`, `classical`, `puzzle` each have separate `UserRating` rows.

---

## 15. Tournament Architecture

### Arena Tournament (most common, Lichess-style)
- Open for a fixed duration (e.g., 5 min). Players join, play immediately when paired.
- Pairing: player with fewest recent games is paired first; try to avoid repeat opponents.
- Scoring: +2 win, +1 draw, +0 loss. Berserk (halve time for +1 bonus point on win).
- Real-time leaderboard via Redis ZADD.

### Swiss Tournament
- Fixed rounds (e.g., 7 rounds of 5 min games).
- Pairing: `tournament-service` runs Dutch System pairing algorithm after each round.
- Tiebreak: Buchholz, Sonneborn-Berger.

### Round Robin
- All vs all. For small groups (≤16 players).

### Knockout
- Single-elimination bracket. Generated after registration closes.

**State machine per tournament:**

```
UPCOMING → REGISTRATION_OPEN → ONGOING → COMPLETED
                                  │
                                  ├─► ROUND_PENDING
                                  ├─► ROUND_ACTIVE (games running)
                                  └─► ROUND_COMPLETE (wait for next)
```

---

## 16. Friends & Social Features

**social-service** owns:
- Bidirectional friend graph (stored in `Friendship` table, not as undirected edges).
- Follow graph (one-directional, `Follow` table).
- Online presence (Redis `online:{userId}` with 30s TTL, refreshed by socket heartbeat).
- Activity feed (Kafka consumer → write to MongoDB `activity_feed` collection).

**Activity types:** `game_played`, `puzzle_solved`, `tournament_joined`, `rating_milestone`, `streak_achieved`.

**Friend list includes:** username, avatar, online status, current rating, current activity (idle/playing/solving).

---

## 17. Chat Service

**chat-service** uses MongoDB for message storage (high write throughput, flexible schema, easy sharding by `roomId`).

**Mongoose schema:**
```typescript
const MessageSchema = new Schema({
  roomId:    { type: String, required: true, index: true },
  roomType:  { type: String, enum: ['game', 'tournament', 'study', 'dm'] },
  senderId:  { type: String, required: true },
  username:  { type: String, required: true },
  text:      { type: String, required: true, maxlength: 500 },
  createdAt: { type: Date,   default: Date.now, index: true },
});
MessageSchema.index({ roomId: 1, createdAt: -1 });
```

**Retention:** Game chat messages retained for 30 days then TTL-deleted via MongoDB TTL index. DMs retained indefinitely.

**Moderation:** Messages pass through a lightweight profanity filter (bad-words npm) before storage.

---

## 18. Notifications

**notification-service** is a Kafka consumer that fans out notifications.

**Triggers → Kafka events consumed:**
- `game.completed` → notify both players with result + rating change
- `friend.request.sent` → notify target
- `tournament.starting` → notify all registered players (5 min warning)
- `challenge.received` → notify target
- `game.reminder` → correspondence game due

**MongoDB schema:**
```typescript
const NotificationSchema = new Schema({
  userId:    { type: String, required: true, index: true },
  type:      { type: String, required: true },
  data:      { type: Schema.Types.Mixed },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
```

**Delivery channels:**
1. **In-app socket:** emit `notification` event if user is online.
2. **Email:** BullMQ job → SendGrid/SES (rate-limited: max 3 emails/hour/user).
3. **Push (future):** FCM/APNS via separate push-service.

---

## 19. Leaderboards

**leaderboard-service** maintains Redis sorted sets and periodically snapshots to PostgreSQL.

```
Real-time:  ZADD leaderboard:blitz {rating} {userId}    on every game end
Query:      ZREVRANGEBYSCORE leaderboard:blitz +inf -inf WITHSCORES LIMIT 0 100
Rank:       ZREVRANK leaderboard:blitz {userId}
Score:      ZSCORE leaderboard:blitz {userId}
```

**Time-scoped leaderboards:** A cron job runs at midnight UTC and copies the current sorted set to `leaderboard:week:blitz` and `leaderboard:month:blitz` (only on Sunday / first of month respectively). Monthly snapshotted to PostgreSQL for history.

**Display:** top-100 is fetched then enriched (username, avatar) via batch user-service call. Results cached for 60 seconds.

---

## 20. Spectator Mode

Spectators connect via socket and call `spectate { roomId }`. The server:
1. Adds `socketId` to `spectators:{roomId}` Redis Set.
2. Sends current `game_start` state to spectator.
3. On each `move_made` event, broadcasts to the room's spectator set.
4. Updates `spectator_count` in room JSON and emits to all.

**Delay for rated games:** spectators see moves with a 15-second delay to prevent cheating assistance. Implemented by delaying the `move_made` broadcast to the spectator room using a setTimeout queued in the gateway.

**Chat:** spectators can chat in a separate `spectator:{roomId}` chat room (not visible to players).

---

## 21. Puzzle System

**puzzle-service** manages a bank of ~4M tactical puzzles (imported from Lichess open puzzle database).

**Spaced repetition scheduling:** modified SM-2 algorithm. `PuzzleAttempt` records update a user's `next_review_at` per puzzle.

**Rating:** Puzzle ratings are also Glicko-2, updated after each attempt (puzzle wins when user fails).

**Daily puzzle:** deterministic by date — `SELECT puzzle WHERE id = consistent_hash(date) % puzzle_count`. Cached in Redis for 24h.

**Themes available:** `fork`, `pin`, `skewer`, `discoveredAttack`, `doubleCheck`, `backRank`, `mate_in_1`, `mate_in_2`, `mate_in_3`, `endgame`, `opening`, `middlegame`, etc.

---

## 22. Opening Explorer

**opening-service** serves opening statistics computed from a corpus of master games.

**Elasticsearch index `openings`:**
```json
{
  "mappings": {
    "properties": {
      "fen":        { "type": "keyword" },
      "eco":        { "type": "keyword" },
      "name":       { "type": "text" },
      "moves":      { "type": "keyword" },
      "whiteWins":  { "type": "integer" },
      "draws":      { "type": "integer" },
      "blackWins":  { "type": "integer" },
      "totalGames": { "type": "integer" },
      "avgElo":     { "type": "float" }
    }
  }
}
```

Query: `GET /api/v1/openings/moves?fen=<url-encoded-fen>` returns the next legal moves with win/draw/loss percentages from the master game database.

Pre-computed from PGN archives — a batch job rebuilds the index monthly from the archived games corpus.

---

## 23. Analysis Board

**Frontend:** standalone page (`/analysis`). Imports `chess.js` + `react-chessboard`. User pastes FEN or PGN, plays through positions.

**Stockfish eval (frontend):** Stockfish WASM Web Worker (`stockfish.worker.ts`) runs in browser — no server call needed for basic position analysis.

**Full game analysis (backend):** User clicks "Request Computer Analysis" →
1. `POST /api/v1/analysis/game/:gameId` → 202 Accepted
2. analysis-service queues BullMQ job
3. stockfish-service worker evaluates every position at depth 18
4. Results stored in MongoDB `analyses` collection
5. Client polls or listens for socket `analysis_complete` event

**Analysis result structure:**
```typescript
interface GameAnalysis {
  gameId: string;
  positions: PositionEval[];
  classifications: { [moveIndex: number]: MoveClassification };
  // brilliancy, good, inaccuracy, mistake, blunder, miss
  accuracy: { white: number; black: number }; // percentage
}
```

---

## 24. Studies

User-created interactive boards for training and sharing.

**MongoDB schema:**
```typescript
const StudySchema = new Schema({
  ownerId:     String,
  title:       String,
  description: String,
  isPublic:    Boolean,
  chapters:    [ChapterSchema],
  collaborators: [String], // userIds
  viewCount:   Number,
  createdAt:   Date,
  updatedAt:   Date,
});

const ChapterSchema = new Schema({
  name:       String,
  fen:        String,   // starting FEN
  pgn:        String,   // with annotations and variations
  orientation: String,  // 'white' | 'black'
  mode:       String,   // 'normal' | 'practice' | 'gamebook' | 'conceal'
  comments:   [{ userId: String, text: String, plyIndex: Number }],
});
```

**Collaborative editing:** Socket room `study:{studyId}` — board sync via `study_move`, `study_comment`, `study_shape` events (similar to Lichess study rooms).

---

## 25. AI Coach

**ai-coach-service** (future / premium feature) wraps a language model API to provide natural language game analysis.

Input: `GameAnalysis` + move classifications + player history.

Output: Personalized coaching summary — "You tend to play too passively in the endgame. In move 34, you missed a winning rook activation..."

**Implementation:** LLM API call (Claude API via `@anthropic-ai/sdk`) with a system prompt seeded by the game analysis JSON. Streamed back to client via SSE.

---

## 26. File Uploads & CDN

**media-service** handles all binary uploads.

**Avatar upload flow:**
1. Client `POST /api/v1/media/avatar` (multipart/form-data, max 2MB, jpg/png/webp)
2. media-service validates MIME type (magic bytes, not just Content-Type)
3. Resize to 200×200 and 64×64 thumbnails (via `sharp`)
4. Upload both sizes to S3/MinIO under `avatars/{userId}/{size}.webp`
5. Update `user.avatarUrl` in user-service via internal gRPC call
6. Return CDN URL

**S3 bucket layout:**
```
chessweb-media/
├── avatars/{userId}/200.webp
├── avatars/{userId}/64.webp
├── pgn/{year}/{month}/{gameId}.pgn
└── pgn-archive/{year}-{month}.pgn.zst
```

**CDN:** CloudFront (AWS) or Cloudflare R2 fronting S3. All media URLs are CDN URLs, never direct S3.

---

## 27. Logging

All services use **Pino** (structured JSON logs, high performance) via `packages/logger`.

```typescript
// packages/logger/index.ts
import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

**Log schema:**
```json
{
  "level": 30,
  "time": 1719000000000,
  "service": "game-service",
  "traceId": "abc123",
  "userId": "uid_xyz",
  "msg": "move_made",
  "roomId": "room_abc",
  "move": "e2e4",
  "latencyMs": 3
}
```

**Log aggregation:** Pino ships logs to stdout → collected by Fluentd/Fluent Bit → forwarded to **Loki** (self-hosted) or **AWS CloudWatch Logs**. Queried via **Grafana**.

**Trace IDs:** Propagated via `x-trace-id` HTTP header through API Gateway → all services. Generated at gateway if absent.

---

## 28. Metrics & Monitoring

**Prometheus** metrics exposed at `/metrics` on each service (via `nestjs-prometheus` / `prom-client`).

**Key metrics per service:**
```
# game-service
chessweb_active_games_total (gauge)
chessweb_moves_per_second (counter)
chessweb_game_duration_seconds (histogram)
chessweb_socket_connections_total (gauge)

# matchmaking-service
chessweb_queue_depth{variant="blitz"} (gauge)
chessweb_match_wait_seconds (histogram)

# stockfish-service
chessweb_stockfish_job_duration_ms (histogram)
chessweb_stockfish_queue_depth (gauge)

# auth-service
chessweb_login_total{status="success|fail"} (counter)
chessweb_token_refresh_total (counter)
```

**Grafana dashboards:**
- Platform overview (active users, active games, queue depths)
- Service health (p50/p95/p99 latencies, error rates)
- Database health (connection pool usage, query latencies)
- Redis health (memory, hit rate, evictions)
- Stockfish throughput

**Alerting rules (AlertManager):**
- Queue depth > 1000 for > 2 min → PagerDuty
- Error rate > 1% → Slack
- p99 latency > 500ms → Slack
- Pod OOMKilled → PagerDuty

**Uptime monitoring:** Grafana Synthetic Monitoring or UptimeRobot pings `/health` on each service every 30s.

---

## 29. Docker Setup

### Local development `docker-compose.yml` (repo root)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: chess
      POSTGRES_PASSWORD: chess123
      POSTGRES_DB: chessweb
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chess"]
      interval: 5s
      retries: 5

  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: [mongo_data:/data/db]
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh --quiet
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    ports: ["6379:6379"]
    volumes: [redis_data:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  elasticsearch:
    image: elasticsearch:8.13.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    ports: ["9200:9200"]
    volumes: [es_data:/usr/share/elasticsearch/data]

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes: [minio_data:/data]

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    depends_on: [zookeeper]
    ports: ["9092:9092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

volumes:
  postgres_data:
  mongo_data:
  redis_data:
  es_data:
  minio_data:
```

### Service Dockerfiles

Each NestJS service follows this pattern:
```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/game-service/package.json ./apps/game-service/
COPY packages/*/package.json ./packages/*/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter game-service build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/game-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3003
CMD ["node", "dist/main"]
```

---

## 30. Kubernetes Layout

```
k8s/
├── namespaces/
│   ├── chessweb-prod.yaml
│   └── chessweb-staging.yaml
├── ingress/
│   └── ingress.yaml          ← nginx-ingress, SSL termination
├── services/
│   ├── auth-service/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── hpa.yaml           ← HorizontalPodAutoscaler
│   │   └── configmap.yaml
│   ├── game-service/          ← StatefulSet for sticky sessions
│   ├── matchmaking-service/
│   ├── stockfish-service/     ← deployed on CPU-optimized node pool
│   └── ... (one folder per service)
├── databases/
│   ├── postgres-primary.yaml
│   ├── postgres-replica.yaml
│   ├── redis-cluster.yaml
│   └── mongo-replicaset.yaml
└── monitoring/
    ├── prometheus.yaml
    ├── grafana.yaml
    └── alertmanager.yaml
```

**Key Kubernetes decisions:**

- **game-service** uses a `StatefulSet` (not Deployment) with sticky socket sessions via nginx-ingress `nginx.ingress.kubernetes.io/affinity: "cookie"`. Or use Redis adapter for Socket.io (all instances share pub/sub) — preferred.
- **stockfish-service** runs on a dedicated node pool with `nodeSelector: workload: cpu-intensive` and `resource.requests.cpu: "2"`.
- **HPA** on all services: `minReplicas: 2`, `maxReplicas: 20`, scale on CPU 70% OR custom metric (BullMQ queue depth via KEDA).
- **KEDA** (Kubernetes Event-Driven Autoscaling) scales stockfish workers based on BullMQ `bull:stockfish:*` queue depth.
- **PodDisruptionBudget** on every service: `minAvailable: 1` (zero-downtime rolling updates).
- **Secrets** via Kubernetes Secrets (or HashiCorp Vault for production).

---

## 31. CI/CD Pipeline

**GitHub Actions** with Turborepo caching.

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  affected:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.turbo.outputs.affected }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }
      - run: pnpm turbo run build lint test --affected --dry-run=json > affected.json
      - id: turbo
        run: echo "affected=$(cat affected.json)" >> $GITHUB_OUTPUT

  test:
    needs: affected
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run test --filter=...[HEAD^1]
      - run: pnpm turbo run lint --filter=...[HEAD^1]

  docker-build:
    needs: test
    if: github.ref == 'refs/heads/main'
    strategy:
      matrix:
        service: [auth-service, game-service, matchmaking-service, ...]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/${{ matrix.service }}/Dockerfile
          push: true
          tags: ghcr.io/chessweb/${{ matrix.service }}:${{ github.sha }}

  deploy:
    needs: docker-build
    runs-on: ubuntu-latest
    steps:
      - uses: azure/k8s-set-context@v3
        with: { kubeconfig: ${{ secrets.KUBECONFIG }} }
      - run: |
          for svc in $SERVICES; do
            kubectl set image deployment/$svc $svc=ghcr.io/chessweb/$svc:${{ github.sha }} -n chessweb-prod
            kubectl rollout status deployment/$svc -n chessweb-prod
          done
```

**Deployment strategy:** Rolling update with `maxUnavailable: 0`, `maxSurge: 1`. Automatic rollback if health check fails within 2 min.

**Staging:** Every PR gets a preview namespace `chessweb-pr-{number}` with all services and a seeded test database.

---

## 32. Testing Strategy

```
Unit tests        packages/elo, packages/chess-engine, packages/pgn-parser
                  Each service: service layer (mocked DB), utility functions
                  Tool: Jest, ts-jest

Integration tests  Each service against real DB (Testcontainers — Docker in CI)
                  Test: auth flow, game create/save, matchmaking pairing
                  Tool: Jest + Supertest + Testcontainers

E2E tests         Full stack: frontend + all services (local docker-compose)
                  Test: register → login → queue → game → checkmate → rating updated
                  Tool: Playwright

Load tests        k6 scripts: 10k concurrent socket connections, 50k req/s REST
                  Target: p99 < 100ms REST, p99 < 50ms socket move latency
                  Tool: k6 (run in CI weekly)

Contract tests    Pact: consumer-driven contracts between services
                  Ensures API Gateway → service compatibility across deploys
```

**Coverage targets:** 80%+ unit coverage on shared packages, 60%+ on service layers.

---

## 33. Scaling to 11M+ Users

**Expected load profile:** ~11M registered users, ~500K daily active, ~50K peak concurrent games, ~100K peak socket connections.

| Layer | Strategy |
|---|---|
| **CDN** | All static assets, PGN files, avatars served from Cloudflare. Offloads ~70% of requests from origin. |
| **API Gateway** | 10+ nginx replicas behind AWS ALB. TLS termination, HTTP/2, gzip. |
| **game-service** | 20+ replicas. Socket.io uses `@socket.io/redis-adapter` so any node handles any room. |
| **matchmaking-service** | 3+ replicas (stateless — Redis is source of truth). |
| **stockfish-service** | 50+ workers on CPU-optimized nodes. KEDA scales on queue depth. |
| **PostgreSQL** | Primary + 2 read replicas. PgBouncer connection pooling. Read replica for all SELECT (history, leaderboard). Write only on primary. |
| **Redis** | Redis Cluster (6 nodes: 3 primary + 3 replica). Separate cluster for game state and BullMQ. |
| **MongoDB** | Replica set (1 primary + 2 secondary). Shard on `roomId` for chat collection once > 100GB. |
| **Elasticsearch** | 3-node cluster. Index sharding by variant/time. |
| **Kafka** | 3 brokers, 6 partitions per topic, replication factor 3. |
| **Database connections** | PgBouncer pools: 20 connections per service instance. App-level pool: 5. Total DB connections: ~200. |

**Bottleneck analysis:**
- Move validation is in-memory (chess.js) — not a bottleneck.
- Redis `GET`/`SET` for game state: single-digit ms per op — not a bottleneck at 50K games.
- PostgreSQL write on game end: burst of ~5K writes/min at peak → handled by batching with a 2s window and primary write queue.
- Stockfish CPU: 50 workers × 1 CPU = 50 parallel analyses. At 50K games/day with 20% requesting analysis = 10K jobs/day = ~7/min — easily handled.

---

## 34. Security

**Authentication:** RS256 JWT (not HS256 — public key verification in API Gateway without shared secret).

**API Gateway checks:** JWT signature, expiry, IP rate limit, request size limit (1MB default).

**Input validation:** All DTOs validated with `class-validator` in NestJS. Zod schemas in `packages/dto` for shared types.

**Move validation:** Server-side `chess.js` validates every move. Client cannot cheat by sending illegal moves.

**Cheating detection:** Anti-cheat service (future): move timing analysis, engine correlation detection, flag for human review.

**SQL injection:** Prisma uses parameterized queries — safe by default.

**XSS:** Chat messages HTML-escaped before storage. No `dangerouslySetInnerHTML` in frontend.

**CORS:** API Gateway allows only `https://chessweb.com` (and localhost in dev).

**Secrets management:** No secrets in code or Docker images. Kubernetes Secrets + HashiCorp Vault. Rotated via automation.

**DDoS:** Cloudflare in front. Rate limiting at both CDN layer and API Gateway.

**WebSocket auth:** JWT verified on socket `connection` event. Unauthenticated connections rejected immediately.

**HTTPS:** TLS 1.3 enforced. HSTS headers. Certificates via Let's Encrypt + cert-manager in K8s.

**Dependency audit:** `pnpm audit` runs in CI. Dependabot auto-creates PRs for CVEs.

---

## 35. Rate Limiting

Implemented in API Gateway (nginx `limit_req_zone`) and per-service via Redis.

```typescript
// packages/rate-limit/index.ts — shared Redis sliding window
async function isRateLimited(
  key: string,     // e.g. "ratelimit:ip:1.2.3.4:login"
  limit: number,
  windowMs: number,
  redis: Redis,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowMs;
  await redis.zremrangebyscore(key, '-inf', windowStart);
  const count = await redis.zcard(key);
  if (count >= limit) return true;
  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));
  return false;
}
```

**Limits by endpoint:**
| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 10 req/min per IP |
| `POST /auth/register` | 5 req/min per IP |
| `POST /auth/forgot-password` | 3 req/10min per IP |
| `WebSocket connect` | 5 connections/min per IP |
| `move` socket event | 60 moves/min per user (anti-spam) |
| REST API (authenticated) | 300 req/min per user |
| REST API (unauthenticated) | 60 req/min per IP |
| Analysis requests | 5 per hour per user (CPU cost) |

---

## 36. Event Queues (BullMQ + Kafka)

**BullMQ** (Redis-backed) — service-internal async jobs:

| Queue | Producer | Consumer | Job |
|---|---|---|---|
| `matchmaking` | matchmaking-service | matchmaking-service | Pair players from queue |
| `stockfish` | game-service | stockfish-service | Compute best move |
| `analysis` | analysis-service | stockfish-service | Full game analysis |
| `notifications` | notification-service | notification-service | Deliver in-app + email |
| `email` | notification-service | notification-service | Send via SendGrid |
| `rating-update` | game-service | user-service | Recalculate + persist Glicko-2 |

**Kafka** (cross-service event bus) — at scale:

| Topic | Producer | Consumers |
|---|---|---|
| `game.created` | matchmaking-service | notification-service, leaderboard-service |
| `game.completed` | game-service | notification-service, leaderboard-service, analysis-service, social-service |
| `game.move` | game-service | analysis-service (real-time eval), spectator fanout |
| `user.registered` | auth-service | notification-service (welcome email), user-service |
| `user.rating_changed` | game-service | leaderboard-service |
| `tournament.started` | tournament-service | notification-service |
| `puzzle.solved` | puzzle-service | social-service (activity feed) |

**BullMQ job options:**
```typescript
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { age: 3600 },  // keep 1h
  removeOnFail: { age: 86400 },     // keep 24h for debugging
}
```

---

## 37. Cron Jobs

Managed by a dedicated `cron-service` (NestJS + `@nestjs/schedule`):

| Schedule | Job | Description |
|---|---|---|
| Every 1 min | `cleanup:abandoned-games` | Set status=ABORTED for rooms with no activity > 60s |
| Every 5 min | `matchmaking:stats` | Log queue depths to Prometheus |
| Every 15 min | `leaderboard:refresh-cache` | Pre-warm top-100 leaderboard cache |
| Every 1 hour | `ratings:provisionals` | Decay RD for inactive players (Glicko-2 step) |
| Every 6 hours | `pgn:archive` | Move old PGN records to S3 |
| Daily midnight | `leaderboard:snapshot-weekly` | Snapshot sorted sets for weekly board |
| Daily 02:00 | `puzzle:refresh-daily` | Rotate daily puzzle |
| Daily 03:00 | `tournament:start-scheduled` | Kick off tournaments with `startAt` in past |
| Weekly Sunday | `leaderboard:snapshot-monthly` | On first Sunday of month |
| Monthly | `opening:reindex` | Rebuild Elasticsearch opening index from PGN archives |

---

## 38. CDN Strategy

```
User browser
     │
     ├─ Static assets (JS, CSS, fonts, piece SVGs)
     │  └── Cloudflare CDN (cache-control: max-age=31536000, immutable)
     │       Vite adds content hash to filenames — safe to cache forever
     │
     ├─ Avatar images / media
     │  └── CloudFront → S3
     │       cache-control: max-age=86400
     │
     ├─ PGN files (download)
     │  └── CloudFront → S3
     │       cache-control: max-age=2592000 (30 days)
     │
     └─ API / WebSocket
        └── NOT cached — goes through Load Balancer → API Gateway → services
```

**Cache invalidation:** on avatar update, media-service sends CloudFront invalidation request for `avatars/{userId}/*`.

**Edge locations:** Cloudflare Anycast — users connect to nearest PoP. Critical for low-latency socket connections in international markets.

---

## 39. ER Diagrams

### Core entities (PostgreSQL)

```
User ─────────────────────────────────────────
  │ 1                                         │
  │ ├─N UserRating (variant,rating,rd,sigma)  │
  │ ├─N Game (as whitePlayer)                 │
  │ ├─N Game (as blackPlayer)                 │
  │ ├─N TournamentPlayer                      │
  │ ├─N PuzzleAttempt                         │
  │ └─N RefreshToken                          │
  │                                           │
Game ─────────────────────────────────────────
  │ N
  └─ Tournament (optional foreign key)

Tournament ───────────────────────────────────
  ├─N TournamentPlayer
  ├─N TournamentRound
  │    └─N TournamentPairing
  └─N Game

Puzzle ───────────────────────────────────────
  └─N PuzzleAttempt → User

Friendship: (requesterId, addresseeId, status)
Follow:     (followerId, followingId)
```

### Chat / Notifications (MongoDB)

```
Message:  { roomId, roomType, senderId, username, text, createdAt }
Notification: { userId, type, data, read, createdAt }
Analysis: { gameId, positions[], classifications{}, accuracy{} }
Study:    { ownerId, chapters[], collaborators[] }
ActivityFeed: { userId, type, actorId, data, createdAt }
```

---

## 40. Sequence Diagrams

### Matchmaking → Game Start

```
Alice                   MatchmakingService         Redis           Bob
  │                            │                     │               │
  │── join_queue (blitz) ─────►│                     │               │
  │                            │── LPUSH queue:blitz─►              │
  │◄── queued ─────────────────│                     │               │
  │                            │                     │── join_queue ─┤
  │                            │◄──────── LPUSH ─────│               │
  │                            │                     │               │
  │           [BullMQ 500ms tick]                    │               │
  │                            │── RPOP × 2 ─────────►               │
  │                            │── SET game:room:XYZ─►               │
  │                            │                     │               │
  │◄── match_found {roomId} ───│─────────────────────────────────────►
  │                            │                     │               │
  │── join_room {roomId} ─────►│                     │               │
  │                            │◄────────────────────── join_room ───│
  │                            │── GET game:room:XYZ─►               │
  │◄── game_start ─────────────│─────────────────────────────────────►
```

### Move Processing

```
Client (Alice)          GameGateway              Redis           DB (Postgres)
  │                          │                     │                  │
  │── move {e2e4} ──────────►│                     │                  │
  │                          │── GET room:XYZ ─────►                  │
  │                          │◄── room JSON ───────│                  │
  │                          │ chess.js validate   │                  │
  │                          │── SET room:XYZ ─────►                  │
  │                          │   (updated fen,      │                  │
  │                          │    moves, timers)    │                  │
  │◄── move_made ────────────│─────────────────────────────────────►  │
  │ (broadcast to room)      │                     │                  │
```

### Game End

```
GameGateway     GamesService    RatingService   Redis         Postgres   Kafka
  │                  │                │             │              │         │
  │── saveGame() ───►│                │             │              │         │
  │                  │── INSERT Game─────────────────────────────►│         │
  │                  │── calcRating()─►│            │              │         │
  │                  │              updateRating─────────────────►│         │
  │                  │── ZADD leaderboard──────────►│              │         │
  │                  │── DEL room:XYZ──────────────►│              │         │
  │◄─ game_over ─────│                │             │              │         │
  │ (emit to players)│                │             │              │         │
  │                  │────────────────────────── publish game.completed ────►│
```

---

## 41. Environment Variables

```bash
# ── Database ──────────────────────────────────────────────────
DATABASE_URL=postgresql://chess:chess123@postgres:5432/chessweb
MONGODB_URI=mongodb://mongo:27017/chessweb
REDIS_URL=redis://redis:6379

# ── Auth ──────────────────────────────────────────────────────
JWT_PRIVATE_KEY=<RS256 private key PEM, base64>
JWT_PUBLIC_KEY=<RS256 public key PEM, base64>
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30

# ── OAuth ─────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# ── Service Ports ─────────────────────────────────────────────
AUTH_SERVICE_PORT=3001
USER_SERVICE_PORT=3002
GAME_SERVICE_PORT=3003
GAME_WS_PORT=3004
MATCHMAKING_SERVICE_PORT=3005
STOCKFISH_SERVICE_PORT=3006

# ── Internal Service URLs (K8s: use service DNS) ──────────────
AUTH_SERVICE_URL=http://auth-service:3001
USER_SERVICE_URL=http://user-service:3002
GAME_SERVICE_URL=http://game-service:3003

# ── S3 / Media ────────────────────────────────────────────────
S3_BUCKET=chessweb-media
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
CDN_BASE_URL=https://cdn.chessweb.com

# ── Email ─────────────────────────────────────────────────────
SENDGRID_API_KEY=
EMAIL_FROM=noreply@chessweb.com

# ── Kafka ─────────────────────────────────────────────────────
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=chessweb
KAFKA_GROUP_ID=chessweb-consumers

# ── Elasticsearch ────────────────────────────────────────────
ELASTICSEARCH_URL=http://elasticsearch:9200

# ── App ──────────────────────────────────────────────────────
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://chessweb.com
FRONTEND_URL=https://chessweb.com
```

---

## 42. DTOs

Defined in `packages/dto` using Zod (runtime validation) and TypeScript types.

```typescript
// packages/dto/src/auth.dto.ts
import { z } from 'zod';

export const RegisterDto = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  email:    z.string().email(),
  password: z.string().min(8).max(72),
  name:     z.string().min(1).max(50),
});

export const LoginDto = z.object({
  username: z.string(),
  password: z.string(),
});

export const TokenResponseDto = z.object({
  accessToken:  z.string(),
  refreshToken: z.string(),
  expiresIn:    z.number(),
  user:         UserDto,
});

// packages/dto/src/game.dto.ts
export const MoveDto = z.object({
  from:      z.string().length(2),
  to:        z.string().length(2),
  promotion: z.enum(['q','r','b','n']).optional(),
  san:       z.string(),
  fen:       z.string(),
  moveIndex: z.number().int(),
});

export const GameDto = z.object({
  id:             z.string(),
  whiteUsername:  z.string(),
  blackUsername:  z.string(),
  whiteRating:    z.number(),
  blackRating:    z.number(),
  result:         z.enum(['white','black','draw','aborted']),
  reason:         z.string(),
  variant:        z.enum(['bullet','blitz','rapid','classical']),
  timeControl:    z.number(),
  moves:          z.array(z.string()),
  pgn:            z.string(),
  createdAt:      z.string().datetime(),
});

export const TimerDto = z.object({
  white: z.number(), // ms remaining
  black: z.number(),
});
```

---

## 43. Error Codes

All error responses follow:
```json
{
  "statusCode": 400,
  "error": "BAD_REQUEST",
  "code": "AUTH_001",
  "message": "Username already taken",
  "timestamp": "2026-06-23T12:00:00Z",
  "traceId": "abc123"
}
```

| Code | HTTP | Message |
|---|---|---|
| `AUTH_001` | 400 | Username already taken |
| `AUTH_002` | 400 | Email already registered |
| `AUTH_003` | 401 | Invalid credentials |
| `AUTH_004` | 401 | Token expired |
| `AUTH_005` | 401 | Token invalid |
| `AUTH_006` | 403 | Email not verified |
| `AUTH_007` | 400 | Refresh token invalid or expired |
| `GAME_001` | 400 | Invalid move |
| `GAME_002` | 404 | Room not found |
| `GAME_003` | 403 | Not your turn |
| `GAME_004` | 409 | Game already ended |
| `GAME_005` | 400 | Draw offer already pending |
| `MATCH_001` | 409 | Already in queue |
| `MATCH_002` | 404 | Not in queue |
| `PUZZLE_001` | 404 | Puzzle not found |
| `PUZZLE_002` | 409 | Already attempted today |
| `SOCIAL_001` | 409 | Friend request already sent |
| `SOCIAL_002` | 404 | Friend request not found |
| `UPLOAD_001` | 400 | File too large (max 2MB) |
| `UPLOAD_002` | 400 | Invalid file type |
| `RATE_001` | 429 | Too many requests |

---

## 44. Deployment Architecture

```
                    Internet
                       │
              ┌────────▼─────────┐
              │   Cloudflare     │  DDoS protection, CDN, DNS
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │   AWS ALB        │  HTTPS termination, health checks
              └──┬───────────┬───┘
                 │           │
        ┌────────▼───┐  ┌────▼────────┐
        │  nginx     │  │  nginx      │  (2+ ingress controllers)
        │  Ingress   │  │  Ingress    │
        └────────┬───┘  └────┬────────┘
                 └─────┬─────┘
                       │
              Kubernetes Cluster (EKS / GKE)
              ─────────────────────────────
              Namespace: chessweb-prod
              │
              ├── auth-service        (3 replicas, t3.medium)
              ├── user-service         (3 replicas)
              ├── game-service         (10 replicas, sticky)
              ├── matchmaking-service  (3 replicas)
              ├── stockfish-service    (20 replicas, c5.xlarge pool)
              ├── tournament-service   (2 replicas)
              ├── puzzle-service       (3 replicas)
              ├── analysis-service     (5 replicas, c5.xlarge pool)
              ├── chat-service         (5 replicas)
              ├── notification-service (3 replicas)
              ├── leaderboard-service  (2 replicas)
              ├── media-service        (2 replicas)
              └── search-service       (2 replicas)

              Managed services (outside K8s):
              ├── AWS RDS PostgreSQL (Multi-AZ primary + 2 read replicas)
              ├── AWS ElastiCache Redis Cluster (6 nodes)
              ├── MongoDB Atlas (M30 cluster, 3 nodes)
              ├── AWS MSK Kafka (3 brokers)
              ├── Elastic Cloud (Elasticsearch, 3 nodes)
              └── AWS S3 + CloudFront
```

---

## 45. Redis Pub/Sub Channels

Used for cross-instance communication within a service (e.g., routing socket events to correct game-service pod).

```
chess:game:{roomId}:moves         → broadcast move_made to all pods in room
chess:game:{roomId}:events        → resign, draw_offer, game_over to pods
chess:stockfish:result:{roomId}   → stockfish worker → game-service pod
chess:analysis:result:{userId}    → analysis worker → user's connected pod
chess:notify:{userId}             → notification-service → user's socket pod
chess:presence:{userId}           → online status changes
chess:room:spectators:{roomId}    → spectator count updates
```

Socket.io uses `@socket.io/redis-adapter` which uses pub/sub internally — these custom channels are for cross-service (not cross-pod) routing.

---

## 46. Kafka Events (Future Scale)

Full event schema for all topics:

```typescript
// game.completed event
interface GameCompletedEvent {
  eventType: 'game.completed';
  gameId: string;
  whiteId: string;
  blackId: string;
  whiteUsername: string;
  blackUsername: string;
  result: 'white' | 'black' | 'draw';
  reason: string;
  variant: string;
  whiteRatingBefore: number;
  blackRatingBefore: number;
  whiteRatingAfter: number;
  blackRatingAfter: number;
  moves: string[];
  pgn: string;
  durationSeconds: number;
  tournamentId?: string;
  timestamp: string;
}

// user.registered event
interface UserRegisteredEvent {
  eventType: 'user.registered';
  userId: string;
  username: string;
  email: string;
  oauthProvider?: string;
  timestamp: string;
}

// puzzle.solved event
interface PuzzleSolvedEvent {
  eventType: 'puzzle.solved';
  userId: string;
  puzzleId: string;
  solved: boolean;
  timeMs: number;
  ratingBefore: number;
  ratingAfter: number;
  timestamp: string;
}
```

**Kafka topics and partitioning:**
| Topic | Partitions | Key | Retention |
|---|---|---|---|
| `game.created` | 12 | `gameId` | 7 days |
| `game.completed` | 12 | `gameId` | 30 days |
| `game.move` | 24 | `roomId` | 1 day |
| `user.registered` | 6 | `userId` | 90 days |
| `user.rating_changed` | 12 | `userId` | 30 days |
| `tournament.started` | 3 | `tournamentId` | 7 days |
| `puzzle.solved` | 6 | `userId` | 30 days |

---

## 47. Read Replicas & Caching Strategies

### PostgreSQL Read Replicas

All `SELECT` queries for non-critical reads route to read replicas:
- Game history pages
- Leaderboard snapshots (historical)
- User profile reads
- Tournament standings

Writes (game save, rating update, user create) always go to primary.

**In Prisma:**
```typescript
// prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient {
  readonly read: PrismaClient; // points to replica DSN

  constructor() {
    super({ datasources: { db: { url: process.env.DATABASE_URL } } });
    this.read = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_REPLICA_URL } },
    });
  }
}
```

### Caching Layers

```
Request
  │
  ├─ L1: In-memory (service-local, 30s TTL)
  │      User profile, active leaderboard top-100
  │
  ├─ L2: Redis (shared, configurable TTL)
  │      Key: cache:{service}:{resource}:{id}
  │      User profile: 5 min
  │      Leaderboard: 60s
  │      Puzzle daily: 24h
  │      Opening stats: 1 hour
  │
  └─ L3: PostgreSQL read replica / MongoDB secondary
         Full query on cache miss
```

**Cache invalidation:** Write-through for user profiles (update DB → delete cache key). TTL-based for leaderboards (accept 60s staleness).

---

## 48. Disaster Recovery

**RTO (Recovery Time Objective):** < 15 minutes for primary failure.
**RPO (Recovery Point Objective):** < 1 minute (max data loss).

| Component | Strategy |
|---|---|
| **PostgreSQL** | AWS RDS Multi-AZ automatic failover (~60s). Daily snapshots to S3 (30-day retention). Point-in-time recovery enabled. |
| **MongoDB Atlas** | 3-node replica set. Atlas auto-failover in <30s. Continuous cloud backup. |
| **Redis** | ElastiCache Cluster with replication. Active game rooms (Redis) are ephemeral — lost rooms on Redis failure trigger game abort (Kafka `game.aborted` event, users refunded any ELO loss). |
| **Kafka (MSK)** | 3 brokers, replication factor 3. AZ-redundant. MSK handles broker failures automatically. |
| **S3/CloudFront** | AWS SLA 99.999999999%. Region replication for critical buckets. |
| **Kubernetes** | Multi-AZ node groups. Pods reschedule automatically on node failure. |
| **Secrets** | HashiCorp Vault with Raft storage (3 nodes). Vault Disaster Recovery replication to secondary region. |

**Runbook for Redis failure:**
1. Alert fires (Redis connection errors > 100/min).
2. ElastiCache promotes replica to primary automatically.
3. game-service pods reconnect (exponential backoff in ioredis config).
4. Active game rooms lost → game-service detects missing room → emit `game_over` with reason `server_error` → no rating change.
5. Post-incident: audit lost games, manually compensate affected users via admin tool.

**Backups tested monthly** via automated restore drill to isolated VPC.

---

## 49. Future Features

| Feature | Tech Notes |
|---|---|
| **Mobile apps** | React Native (web views for board), share packages/ui components |
| **Live streaming** | WebRTC + HLS, game broadcast to Twitch/YouTube via RTMP |
| **Voice chat** | WebRTC peer-to-peer via Coturn TURN server |
| **Variants** | Chess960 (Fischer Random) already in schema (`variant` field). Crazyhouse, King of the Hill: extend chess-engine package |
| **Correspondence** | Already supported via `TimeVariant.CORRESPONDENCE`. Email notifications via cron |
| **AI Coach v2** | Fine-tuned model on annotated GM games. Personalized weakness detection |
| **Anti-cheat v2** | Statistical engine correlation (Stockfish move agreement %). Flag → human moderator review |
| **Clubs** | `Club`, `ClubMember`, `ClubTournament` entities. Club leaderboards |
| **Simuls** | One grandmaster vs 20 players simultaneously. Special matchmaking mode |
| **Subscriptions** | Stripe integration. Premium = unlimited analysis, no ads, custom themes |
| **Ads** | Google Ad Manager for free-tier users (non-intrusive, sidebar only) |
| **Replay TV** | Notable games replayed at real speed with live commentary feed |
| **Board themes** | User-selectable piece sets and board colors. Stored in `user_settings` |
| **Keyboard shortcuts** | Arrow keys for move navigation, flip board, etc. |
| **FIDE integration** | Import FIDE rating for verification badge |
| **Kafka analytics** | ClickHouse consumer for `game.*` topics → real-time analytics dashboard |
