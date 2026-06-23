# Feature 04 — Stockfish (Computer Opponent)

**Branch:** `feature/stockfish`
**Depends on:** `feature/game-engine`

## Goal
Play against a computer opponent powered by Stockfish. Browser-side WASM for local games; backend BullMQ worker for tournament/analysis use.

---

## Frontend (Primary — Browser WASM)

### File
```
frontend/src/workers/stockfish.worker.ts
```

### How it works
1. Player makes a move in "vs Computer" mode
2. `ChessBoard` component sees it's the computer's turn
3. Spawns Stockfish Web Worker with current FEN
4. Stockfish sends UCI commands, returns `bestmove`
5. Apply the best move after a difficulty-based delay
6. Emit to game state as if it were a socket move

### Stockfish UCI flow
```
Worker receives: { fen, movetime }
→ postMessage('uci')
→ postMessage('isready')
→ postMessage(`position fen ${fen}`)
→ postMessage(`go movetime ${movetime}`)
← receives: 'bestmove e2e4 ...'
→ returns: 'e2e4'
```

### Difficulty levels
| Level | movetime | Skill Level (UCI) |
|---|---|---|
| Beginner | 50ms | 1 |
| Easy | 200ms | 5 |
| Medium | 1000ms | 10 |
| Hard | 3000ms | 15 |
| Master | 5000ms | 20 (max) |

### Stockfish source
Load from CDN in the Web Worker:
```typescript
importScripts('https://cdn.jsdelivr.net/npm/stockfish@16/src/stockfish.js');
```
Or bundle locally via npm `stockfish` package.

---

## Backend (BullMQ Worker — for Analysis & Tournament)

### Files
```
backend/src/stockfish/
├── stockfish.module.ts
├── stockfish.service.ts    — enqueue jobs
└── stockfish.processor.ts  — BullMQ worker
```

### Job payload
```typescript
interface StockfishJob {
  fen:      string;
  movetime?: number;  // ms — for vs-computer move
  depth?:   number;   // for full analysis
  multipv?: number;   // lines (1 for best move, 3+ for analysis)
  roomId?:  string;   // route result back to game room
  userId?:  string;   // route result back to analysis session
}
```

### Worker logic
```typescript
// stockfish.processor.ts
@Processor('stockfish')
export class StockfishProcessor {
  @Process()
  async handle(job: Job<StockfishJob>) {
    const engine = new StockfishEngine(); // spawns native stockfish binary
    engine.send(`position fen ${job.data.fen}`);
    engine.send(`go movetime ${job.data.movetime ?? 1000}`);
    const bestmove = await engine.waitForBestmove();

    if (job.data.roomId) {
      // publish via Redis pub/sub → GameGateway picks up → emits move_made
      await this.redis.publish(
        `chess:stockfish:result:${job.data.roomId}`,
        JSON.stringify({ bestmove, roomId: job.data.roomId })
      );
    }
  }
}
```

---

## Checklist
- [ ] `stockfish.worker.ts` — Web Worker with UCI protocol
- [ ] Difficulty selector in Lobby
- [ ] ChessBoard: detect computer's turn → call worker
- [ ] Apply computer move after delay
- [ ] Computer game doesn't use WebSocket (local only)
- [ ] Backend: StockfishProcessor BullMQ worker
- [ ] Backend: StockfishService.enqueue()
- [ ] Backend: Redis pub/sub result routing to GameGateway
- [ ] Stockfish binary or WASM available in backend env

## Verify
1. Select "vs Computer (Medium)" → game starts
2. Player moves → Stockfish responds within ~1 second
3. Stockfish plays legal, sensible moves
4. Checkmate/resign works same as online game
5. Difficulty setting changes engine strength noticeably
