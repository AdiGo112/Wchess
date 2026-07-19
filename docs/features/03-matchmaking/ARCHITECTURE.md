# 03-Matchmaking — Architecture

## Service map

```
Browser (React)
    |
    | Socket.io (/matchmaking namespace)
    v
MatchmakingGateway (NestJS)
    |
    |--- MatchmakingService
    |     |--- Redis (queues + challenge tokens)
    |     |--- GameService (creates game room on match)
    |     |--- setInterval (500ms polling loop)
    |
    |--- PrismaService --> PostgreSQL
          |-- Challenge table (friend challenges)
```

## Data flow: quick match

```
1. Client emits join_queue { variant: 'blitz', timeControl: 300, increment: 0 }
2. MatchmakingGateway stores client socket in a Map<userId, socket>
3. MatchmakingService.enqueue(userId, rating, variant, timeControl):
   a. Build entry: { userId, rating, socketId, enqueuedAt: Date.now() }
   b. LPUSH queue:{variant}:{timeControl} JSON.stringify(entry)
4. 500ms polling loop (setInterval in MatchmakingService):
   a. For each active queue key in Redis:
   b. LRANGE queue:{key} 0 -1 — get all waiting players
   c. Try to pair: find two players whose ratings are within tolerance
   d. Tolerance = min(50 + (waitSeconds * 12), 400) — grows from ±50 to ±400 over 30s
   e. If pair found: LREM both entries, call GameService.createGameRoom(), emit match_found to both sockets
5. match_found { gameId, color, opponent } emitted to each player
6. Frontend navigates to /game/:gameId
```

## Redis key structure

```
queue:{variant}:{timeControl}  — List of JSON-encoded queue entries
  Each entry: { userId, rating, socketId, enqueuedAt }

challenge:{token}  — Hash
  creatorId, variant, timeControl, increment, expiresAt, status (pending/accepted/expired)
  TTL: 10 minutes
```

## Backend file tree

```
backend/src/matchmaking/
├── matchmaking.module.ts
├── matchmaking.gateway.ts    (Socket.io /matchmaking namespace)
├── matchmaking.service.ts    (queue logic, pairing algorithm)
├── matchmaking.controller.ts (REST: challenge endpoints)
├── dto/
│   ├── join-queue.dto.ts
│   └── create-challenge.dto.ts
└── types/
    └── queue-entry.interface.ts
```
