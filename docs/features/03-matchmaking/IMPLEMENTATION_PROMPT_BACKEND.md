# 03-Matchmaking — Backend Implementation Prompt

---

Implement the matchmaking backend for ChessWeb.

## What exists
- Auth complete (JwtAuthGuard, WsJwtGuard)
- Redis injectable (ioredis)
- GameService.createGameRoom() available
- Prisma with User model

## Build

### MatchmakingService methods:
- enqueue(userId, rating, variant, timeControl, increment, socketId): LPUSH to queue:{variant}:{timeControl}
- dequeue(userId, variant, timeControl): LRANGE + filter by userId + LREM
- startPolling(): setInterval 500ms; for each queue key, call tryPair()
- tryPair(queueKey): load entries, sort by enqueuedAt, find pair within tolerance, call match()
- match(entry1, entry2): remove both from Redis, call GameService.createGameRoom(), return gameId
- toleranceForWait(ms): Math.min(50 + Math.floor(ms / 1000) * 12, 400)

### MatchmakingGateway (/matchmaking namespace):
- handleConnection: store socket in Map
- handleDisconnect: dequeue user if in queue
- handleJoinQueue: validate, call enqueue, start position update interval
- handleLeaveQueue: call dequeue, clear position interval

### MatchmakingController:
- POST /matchmaking/challenge: generate crypto.randomBytes(8).toString('hex') token, create Challenge in DB, return shareUrl
- POST /matchmaking/challenge/:token/accept: find Challenge, validate, create game room, emit challenge_accepted via socket to creator, return { gameId, color }
- POST /matchmaking/computer: call GameService.createComputerRoom(userId, difficulty, variant, timeControl), return { gameId }

Write all files.
