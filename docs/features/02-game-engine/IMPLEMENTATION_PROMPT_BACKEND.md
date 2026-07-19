# 02-Game-Engine — Backend Implementation Prompt

---

You are implementing the chess game engine backend for ChessWeb. This is a NestJS application using Socket.io for real-time communication, Redis for active game state, and PostgreSQL for persistence.

## Prerequisites / what already exists
- Auth feature is complete (JwtAuthGuard, User model in Prisma)
- Redis is configured via ioredis in a RedisModule
- BullMQ is installed for job queuing
- PrismaService is injectable

## Task: Build the complete game engine backend

### Architecture
- GameGateway: @WebSocketGateway({ namespace: '/game', cors: true }) with @UseGuards(WsJwtGuard)
- GameService: injected into GameGateway
- ClockService: manages per-game setInterval timers
- Chess logic: use chess.js library (import { Chess } from 'chess.js')

### Step 1: Prisma models
Add Game and Move models (see DOMAIN_MODEL.md for full schema).

### Step 2: WsJwtGuard
Create `backend/src/game/guards/ws-jwt.guard.ts`:
- Implements CanActivate
- Extracts token from client.handshake.auth.token
- Verifies with JwtService
- Sets client.data.userId and client.data.username

### Step 3: GameService
Implement these methods:
- createGameRoom(gameId, whiteId, blackId, variant, timeControl, increment): creates Redis hash
- getGameState(gameId): returns GameRoom from Redis
- applyMove(gameId, userId, moveDto): validates and applies move, updates Redis, returns { valid, move, newFen, terminal? }
- handleTimeout(gameId, color): determines result, calls persistGame
- handleResign(gameId, userId): sets result, calls persistGame
- handleDrawAccept(gameId): sets draw result, calls persistGame
- persistGame(gameId, result, reason): writes Game + Move records to PostgreSQL, calculates rating changes, deletes Redis key

### Step 4: ClockService
- startClock(gameId, turn): starts 100ms interval
- stopClock(gameId): clears interval
- pauseClock(gameId, color): stops decrementing that color
- resumeClock(gameId, color): resumes
- On each tick: update Redis, emit clock_update if 1s boundary crossed, call GameService.handleTimeout if reaches 0

### Step 5: GameGateway
Socket.io handlers:
- handleConnection(client): authenticate, store userId in client.data
- handleDisconnect(client): start 30s grace timer; auto-resign if not reconnected
- handleJoinRoom(client, dto): join Socket.io room, emit game_state
- handleMove(client, dto): call GameService.applyMove, broadcast move_made or emit error
- handleOfferDraw, handleAcceptDraw, handleDeclineDraw, handleResign, handleClaimTimeout

### Step 6: REST controller
GameController with GET /games/:id and GET /games/:id/moves (both require JwtAuthGuard).

Write all files now.
