# Feature 11 — Analysis: Backend Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation to implement the full backend for Feature 11.

---

You are implementing the Analysis backend for ChessWeb, a NestJS + TypeScript chess application. Analysis is powered by Stockfish at depth 18, run asynchronously via BullMQ.

## Stack

- NestJS 10, TypeScript
- MongoDB via `@nestjs/mongoose`
- BullMQ via `@nestjs/bullmq` (already used for Stockfish in Feature 04)
- `chess.js` npm package (already installed) for board state tracking during analysis
- `stockfish` binary — available in the system PATH. Spawned via `node:child_process`
- JWT guard at `backend/src/auth/guards/jwt-auth.guard.ts`, `@GetUser()` decorator returns `{ id, email, username }`

## What Already Exists

- `backend/src/app.module.ts` has `BullModule.forRoot(...)` and `MongooseModule.forRoot(...)`
- `backend/src/stockfish/` directory exists with basic Stockfish spawning code from Feature 04 (single-position eval). You will extend the processor here.
- `backend/src/games/` — A `GamesService` or `GameRepository` exists that can look up a game by ID and return `{ id, whiteUserId, blackUserId, moves: string[], status: 'in_progress'|'completed', pgn: string }`. Use it to validate the game.

## Task: Create the Full Analysis Module

### File 1: `backend/src/analysis/schemas/analysis.schema.ts`

Schema fields (all described in detail in DOMAIN_MODEL.md):
- `gameId: string` — required, unique, indexed
- `status: 'pending'|'completed'|'failed'` — default 'pending'
- `whiteUserId: string` — required
- `blackUserId: string` — required
- `accuracy: { white: number, black: number }` — type Object
- `moves: AnalyzedMove[]` — type [Object]
- `ecoCode: string`, `ecoName: string`, `ecoFamily: string`
- `error: string`
- `completedAt: Date`
- `timestamps: true` for createdAt/updatedAt

### File 2: `backend/src/utils/move-classifier.ts`

Export a pure function:
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

### File 3: `backend/src/utils/eco-lookup.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface EcoEntry { code: string; name: string; family: string; }
let ecoData: Record<string, EcoEntry> | null = null;

function loadEco(): Record<string, EcoEntry> {
  if (!ecoData) {
    const raw = fs.readFileSync(path.join(process.cwd(), 'src/data/eco.json'), 'utf-8');
    ecoData = JSON.parse(raw);
  }
  return ecoData;
}

export function identify(uciMoves: string[]): EcoEntry | null {
  const eco = loadEco();
  let lastMatch: EcoEntry | null = null;
  for (let i = uciMoves.length; i > 0; i--) {
    const key = uciMoves.slice(0, i).join(' ');
    if (eco[key]) { lastMatch = eco[key]; break; }
  }
  return lastMatch;
}
```

### File 4: `backend/data/eco.json`

Create a minimal but real ECO JSON file with at least 20 entries covering common openings. Format:
```json
{
  "e2e4": { "code": "B00", "name": "King's Pawn Opening", "family": "King's Pawn" },
  "e2e4 c7c5": { "code": "B20", "name": "Sicilian Defence", "family": "Sicilian" },
  "e2e4 e7e5": { "code": "C20", "name": "King's Pawn Game", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3": { "code": "C40", "name": "King's Knight Opening", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3 b8c6": { "code": "C44", "name": "King's Knight, Normal Variation", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3 b8c6 f1b5": { "code": "C60", "name": "Ruy Lopez", "family": "Ruy Lopez" },
  "d2d4": { "code": "A40", "name": "Queen's Pawn Game", "family": "Queen's Pawn" },
  "d2d4 d7d5": { "code": "D00", "name": "Queen's Pawn Game", "family": "Queen's Pawn" },
  "d2d4 d7d5 c2c4": { "code": "D06", "name": "Queen's Gambit", "family": "Queen's Gambit" },
  "d2d4 d7d5 c2c4 e7e6": { "code": "D30", "name": "Queen's Gambit Declined", "family": "Queen's Gambit" },
  "d2d4 g8f6": { "code": "A45", "name": "Indian Defence", "family": "Indian" },
  "d2d4 g8f6 c2c4": { "code": "A50", "name": "Indian Defence", "family": "Indian" },
  "d2d4 g8f6 c2c4 g7g6": { "code": "A50", "name": "King's Indian Defence", "family": "King's Indian" },
  "e2e4 c7c6": { "code": "B10", "name": "Caro-Kann Defence", "family": "Caro-Kann" },
  "e2e4 d7d6": { "code": "B07", "name": "Pirc Defence", "family": "Pirc" },
  "e2e4 e7e6": { "code": "C00", "name": "French Defence", "family": "French" },
  "g1f3": { "code": "A04", "name": "Reti Opening", "family": "Reti" },
  "c2c4": { "code": "A10", "name": "English Opening", "family": "English" },
  "c2c4 e7e5": { "code": "A20", "name": "English Opening, King's English", "family": "English" },
  "b1f3 d7d5": { "code": "A06", "name": "Reti Opening", "family": "Reti" }
}
```

### File 5: `backend/src/stockfish/stockfish.processor.ts` (update)

Extend the existing processor to handle `analysis` job type. For each move in `job.data.moves`:
1. Use UCI to get the eval before and after the move.
2. Implement a helper `getEval(fen: string): Promise<{ bestMove: string, score: number }>` that spawns stockfish, sends `position fen <fen>\ngo depth 18\n`, reads stdout lines until `bestmove` appears, and parses the last `info depth 18 score cp <n>` line. Handle `score mate N` by returning ±9999.
3. For each move, compute `cpLoss = Math.max(0, (isWhiteMove ? -1 : 1) * (evalAfter - bestMoveEval))`.
4. Call `classify(cpLoss, detectSacrifice(position, uciMove))`.

### File 6: `backend/src/analysis/analysis.service.ts` and `analysis.controller.ts` and `analysis.module.ts`

Follow the API_DESIGN.md exactly. The controller returns 202 for `POST /analysis/request`. The service queries GamesService for the game, throws appropriate exceptions, creates the analysis doc, and enqueues the BullMQ job with `{ gameId, whiteUserId, blackUserId, moves: game.moves }`.

## Verification Steps

1. `npm run build` — no TypeScript errors
2. `curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"gameId":"<uuid>"}' http://localhost:3000/analysis/request` → 202
3. Check Bull Board — job appears in `stockfish` queue
4. After 10-30 seconds, `curl -H "Authorization: Bearer <jwt>" http://localhost:3000/analysis/<gameId>` → full analysis with moves array
5. Verify `ecoCode` is present for a standard opening game
