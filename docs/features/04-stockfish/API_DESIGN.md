# 04-Stockfish — API Design

## REST endpoints

| Method | Path                    | Auth | Request body                     | Response                          |
|--------|-------------------------|------|----------------------------------|-----------------------------------|
| POST   | /analysis/request       | JWT  | { gameId }                       | { jobId, estimatedSeconds: 30 }   |
| GET    | /analysis/:gameId       | JWT  | —                                | { analysis } or 404 if pending    |
| GET    | /analysis/:gameId/status | JWT | —                                | { status: pending|done|failed }   |

## BullMQ job types

### computer-move job
```typescript
interface ComputerMoveJob {
  gameId: string;
  fen: string;           // current position
  depth: number;         // 1 | 3 | 5 | 10 | 15 (maps to difficulty 1-5)
  moveTimeMs?: number;   // alternative: movetime instead of depth
}
```

### analysis job
```typescript
interface AnalysisJob {
  gameId: string;
  pgn: string;           // full game PGN
  depth: number;         // always 18 for analysis
}
```

## Redis pub/sub channels

```
Channel: stockfish:result:{gameId}
Payload: { gameId, bestMove: string (UCI notation, e.g. 'e2e4') }
```

The GameGateway subscribes to this channel per computer game. When a result arrives, GameGateway applies the move via GameService.applyMove() and broadcasts move_made to the player.

## Depth-to-difficulty mapping

| Difficulty | Label     | Stockfish depth |
|------------|-----------|-----------------|
| 1          | Beginner  | 1               |
| 2          | Easy      | 3               |
| 3          | Medium    | 5               |
| 4          | Hard      | 10              |
| 5          | Expert    | 15              |
