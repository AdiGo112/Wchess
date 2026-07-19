# 04-Stockfish — Increment 1 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 1 of Stockfish integration for ChessWeb: backend BullMQ worker for computer moves.

## Current state
- BullMQ installed: @nestjs/bullmq, bullmq packages available
- Redis injectable via ioredis
- GameGateway exists and handles 'move' event
- Stockfish binary available at: /usr/local/bin/stockfish (or set STOCKFISH_PATH env var)

## What to build
BullMQ computer-move job processor that computes a Stockfish move and publishes it to Redis pub/sub for GameGateway to apply.

## StockfishService
`backend/src/stockfish/stockfish.service.ts`:

```typescript
import { spawn } from 'child_process';
import { Chess } from 'chess.js';

@Injectable()
export class StockfishService {
  private readonly stockfishPath = process.env.STOCKFISH_PATH || '/usr/local/bin/stockfish';

  async getBestMove(fen: string, depth: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.stockfishPath);
      let bestMove: string | null = null;
      const timeout = setTimeout(() => {
        proc.kill();
        // Fallback: random legal move
        const chess = new Chess(fen);
        const moves = chess.moves({ verbose: true });
        if (moves.length > 0) {
          const m = moves[Math.floor(Math.random() * moves.length)];
          resolve(`${m.from}${m.to}${m.promotion || ''}`);
        } else {
          reject(new Error('No legal moves'));
        }
      }, 10000); // 10 second timeout

      proc.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('bestmove')) {
            bestMove = line.split(' ')[1];
            clearTimeout(timeout);
            proc.kill();
            resolve(bestMove);
            break;
          }
        }
      });

      proc.on('error', () => {
        clearTimeout(timeout);
        // Stockfish binary not found — use random move fallback
        const chess = new Chess(fen);
        const moves = chess.moves({ verbose: true });
        const m = moves[Math.floor(Math.random() * moves.length)];
        resolve(`${m.from}${m.to}${m.promotion || ''}`);
      });

      proc.stdin.write('uci\n');
      proc.stdin.write('isready\n');
      proc.stdin.write(`position fen ${fen}\n`);
      proc.stdin.write(`go depth ${depth}\n`);
    });
  }
}
```

## ComputerMoveProcessor
`backend/src/stockfish/workers/computer-move.processor.ts`:

```typescript
@Processor('computer-move')
export class ComputerMoveProcessor {
  constructor(
    private stockfishService: StockfishService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  @Process()
  async process(job: Job<ComputerMoveJob>) {
    const { gameId, fen, depth } = job.data;
    const bestMove = await this.stockfishService.getBestMove(fen, depth);
    // Publish result for GameGateway
    await this.redis.publish(`stockfish:result:${gameId}`, JSON.stringify({ gameId, bestMove }));
    return { bestMove };
  }
}
```

## GameGateway subscription (modify existing)
In GameGateway constructor, subscribe to Redis channel pattern:
```typescript
// In GameGateway constructor or onModuleInit
this.redisSub.psubscribe('stockfish:result:*', (err) => {
  if (err) console.error('Redis subscribe error', err);
});
this.redisSub.on('pmessage', async (pattern, channel, message) => {
  const gameId = channel.split(':')[2];
  const { bestMove } = JSON.parse(message);
  // Parse UCI move e.g. 'e7e5' or 'e7e8q'
  const from = bestMove.slice(0, 2);
  const to = bestMove.slice(2, 4);
  const promotion = bestMove.length === 5 ? bestMove[4] : undefined;
  try {
    const result = await this.gameService.applyMove(gameId, 'computer', { gameId, from, to, promotion });
    this.server.to(`game-${gameId}`).emit('move_made', { fen: result.newFen, move: result.move, clocks: result.clocks, turn: result.turn });
    if (result.terminal) {
      this.clockService.stopClock(gameId);
      this.server.to(`game-${gameId}`).emit('game_over', result.terminal);
    }
  } catch (e) { console.error('Computer move apply failed', e); }
});
```

## After human move in computer game
In GameGateway.handleMove, after broadcasting move_made, check if game has blackId === null (computer game). If yes and it's now the computer's turn:
```typescript
if (!state.blackId && result.turn === 'black' && !result.terminal) {
  const depthMap = [1, 3, 5, 10, 15];
  const depth = depthMap[(state.difficulty || 3) - 1];
  await this.computerMoveQueue.add('computer-move', { gameId: dto.gameId, fen: result.newFen, depth });
}
```

## Verification
1. Create a computer game (POST /matchmaking/computer with difficulty 2)
2. Navigate to /game/:gameId
3. Make a move as white (e.g., e4)
4. Within 2 seconds, the board should update with the computer's response
5. Check Redis: `SUBSCRIBE stockfish:result:{gameId}` should show the move
