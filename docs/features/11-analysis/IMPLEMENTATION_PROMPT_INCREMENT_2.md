# Feature 11 — Increment 2 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 2 of the Analysis feature for ChessWeb. Increment 1 is complete: the MongoDB schema, AnalysisService, REST controller, and module exist. You are now building the Stockfish per-move evaluator and the move classifier.

## Current Codebase State

These files exist and work:
- `backend/src/analysis/schemas/analysis.schema.ts` — Analysis schema with status: pending|completed|failed
- `backend/src/analysis/analysis.service.ts` — requestAnalysis() and getResult()
- `backend/src/analysis/analysis.controller.ts` — POST /analysis/request and GET /analysis/:gameId
- `backend/src/stockfish/stockfish.processor.ts` — exists from Feature 04. Currently handles a different job type for single-position evaluation. You will extend it to handle the 'analyze' job type.
- `chess.js` is installed: `import { Chess } from 'chess.js'`
- The `stockfish` binary is available in the system PATH

## What to Create

### File: `backend/src/utils/move-classifier.ts`

```typescript
export type MoveClassification = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export function classify(cpLoss: number, isBrilliant: boolean): MoveClassification {
  if (isBrilliant && cpLoss < 5) return 'brilliant';
  if (cpLoss < 20) return 'good';
  if (cpLoss < 50) return 'inaccuracy';
  if (cpLoss < 100) return 'mistake';
  return 'blunder';
}
```

## What to Modify: `backend/src/stockfish/stockfish.processor.ts`

Add handling for jobs with `job.name === 'analyze'`. The `analyze` job data has shape: `{ gameId: string, moves: string[], whiteUserId: string, blackUserId: string }`.

Implement a helper function:

```typescript
async function getStockfishEval(fen: string): Promise<{ bestMove: string; scoreCp: number }> {
  return new Promise((resolve, reject) => {
    const engine = spawn('stockfish');
    let bestMove = '';
    let scoreCp = 0;
    let output = '';

    engine.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.startsWith('info') && line.includes('depth 18') && line.includes('score cp')) {
          const match = line.match(/score cp (-?\d+)/);
          if (match) scoreCp = parseInt(match[1], 10);
        }
        if (line.startsWith('info') && line.includes('depth 18') && line.includes('score mate')) {
          const match = line.match(/score mate (-?\d+)/);
          if (match) scoreCp = parseInt(match[1], 10) > 0 ? 9999 : -9999;
        }
        if (line.startsWith('bestmove')) {
          bestMove = line.split(' ')[1];
          engine.stdin.write('quit\n');
        }
      }
    });

    engine.on('close', () => resolve({ bestMove, scoreCp }));
    engine.on('error', reject);

    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write('go depth 18\n');

    // Timeout safety — kill after 60 seconds
    setTimeout(() => { engine.kill(); reject(new Error('Stockfish timeout')); }, 60000);
  });
}
```

In the `process()` method, for `job.name === 'analyze'`:

1. Initialize `const chess = new Chess()`
2. Retrieve the analysis document from MongoDB: `await this.analysisModel.findOne({ gameId })`
3. For each move in `job.data.moves`:
   a. Get FEN before move: `const fenBefore = chess.fen()`
   b. Call `const { bestMove, scoreCp: bestMoveScorecCp } = await getStockfishEval(fenBefore)`
   c. Apply the move: `chess.move(uciMoveToSan(uciMove, chess))` (use chess.js to convert UCI to SAN, or use `chess.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] })`)
   d. Get FEN after move: `const fenAfter = chess.fen()`
   e. Call `const { scoreCp: playedMoveScoreCp } = await getStockfishEval(fenAfter)`
   f. The eval from white's perspective after the played move: `playedEval = -playedMoveScoreCp` (flip because Stockfish evaluates from the moving side)
   g. `cpLoss = Math.max(0, bestMoveScorecCp - playedEval)` for white moves. For black: `cpLoss = Math.max(0, -bestMoveScorecCp - (-playedMoveScoreCp))`... Actually simplify: always compute `cpLoss = Math.max(0, bestMoveEvalFromMovingSide - playedMoveEvalFromMovingSide)`. Since stockfish always reports from the moving side's perspective when you run `go depth 18` from that position, `scoreCp` is positive if the moving side is ahead.
   h. `isBrilliant = false` (v1 approximation — full sacrifice detection deferred)
   i. `classification = classify(cpLoss, isBrilliant)`
   j. Push to `analyzedMoves` array: `{ moveNumber, color, san, uci, fen: fenAfter, eval: playedEval, bestMove, bestMoveEval: bestMoveScorecCp, cpLoss, classification, isBrilliant }`

4. Compute accuracy:
```typescript
const whiteMoves = analyzedMoves.filter(m => m.color === 'white');
const blackMoves = analyzedMoves.filter(m => m.color === 'black');
const goodCategories = ['brilliant', 'good'];
const whiteAccuracy = whiteMoves.length === 0 ? 100 : Math.round((whiteMoves.filter(m => goodCategories.includes(m.classification)).length / whiteMoves.length) * 1000) / 10;
const blackAccuracy = blackMoves.length === 0 ? 100 : Math.round((blackMoves.filter(m => goodCategories.includes(m.classification)).length / blackMoves.length) * 1000) / 10;
```

5. Update the MongoDB document:
```typescript
await this.analysisModel.findOneAndUpdate(
  { gameId },
  { status: 'completed', moves: analyzedMoves, accuracy: { white: whiteAccuracy, black: blackAccuracy }, completedAt: new Date() }
);
```

6. Wrap everything in try/catch. On error:
```typescript
await this.analysisModel.findOneAndUpdate({ gameId }, { status: 'failed', error: err.message });
```

## Verification Steps

1. `npm run start:dev` — no errors
2. POST /analysis/request for a game with 10 moves
3. Wait 15-20 seconds
4. GET /analysis/:gameId → `{ "status": "completed", "moves": [ ... ], "accuracy": { "white": 82.5, "black": 60.0 } }`
5. Confirm `moves` has 20 entries (10 white + 10 black)
6. Confirm each entry has `classification` set correctly
7. Kill the stockfish binary, trigger another analysis → GET shows `{ "status": "failed", "error": "spawn stockfish ENOENT" }`
