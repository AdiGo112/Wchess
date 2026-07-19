# 02-Game-Engine — Architecture

## Service map

```
Browser A (White)    Browser B (Black)
     |                    |
     | Socket.io           | Socket.io
     v                    v
  GameGateway (NestJS WebSocket)
     |
     |--- GameService (business logic)
     |     |--- chess.js (move validation)
     |     |--- ClockService (timers)
     |
     |--- Redis (active game state)
     |     |-- game:{gameId}  JSON: { fen, moves, clocks, status, players }
     |
     |--- PrismaService --> PostgreSQL
     |     |-- Game table (completed games)
     |     |-- Move table (game history)
     |
     |--- BullMQ (stockfish jobs, 04-stockfish feature)
```

## Data flow: player makes a move

```
1. Client emits: move { gameId, from: 'e2', to: 'e4', promotion?: 'q' }
2. GameGateway.handleMove() called
3. GameService.applyMove(gameId, userId, move):
   a. Load game state from Redis: HGETALL game:{gameId}
   b. Verify it is this player's turn (color match)
   c. chess.js: game.move({ from, to, promotion }) — returns null if illegal
   d. If null: emit error to client
   e. Update FEN, push move to moves array
   f. Stop the mover's clock, start opponent's clock
   g. Check terminal states: chess.isCheckmate(), chess.isDraw(), chess.isStalemate()
   h. Save updated state to Redis: HMSET game:{gameId}
   i. If game over: persist to PostgreSQL, delete Redis key
4. Broadcast to room: emit move_made { fen, move, clocks, status }
5. If computer game: dispatch stockfish BullMQ job
```

## Clock management

ClockService uses Node.js setInterval (100ms tick) per active game. Each tick:
- Decrements the active player's clock by 100ms
- If clock reaches 0: triggers timeout flow (emit game_over, persist, cleanup)
- Every second: emits clock_update { white: ms, black: ms } to the room

## Backend file tree

```
backend/src/game/
├── game.module.ts
├── game.gateway.ts         (Socket.io gateway)
├── game.service.ts         (move logic, state management)
├── clock.service.ts        (server-side timer)
├── game.controller.ts      (REST: GET /games/:id)
├── dto/
│   ├── move.dto.ts
│   └── join-room.dto.ts
└── types/
    ├── game-state.interface.ts
    └── game-events.enum.ts

backend/prisma/schema.prisma (Game + Move models)
```

## Redis key structure

```
game:{gameId}  — Hash
  fen          string  (current FEN)
  moves        JSON string (Move[])
  whiteId      string
  blackId      string
  whiteTime    number (ms remaining)
  blackTime    number (ms remaining)
  turn         'white' | 'black'
  status       'active' | 'finished'
  variant      'standard' | 'blitz' | 'bullet' | 'rapid'
  startedAt    number (Unix timestamp)
```
