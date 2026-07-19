# Feature 11 — Increment 3 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 3 of the Analysis feature for ChessWeb. Increments 1 and 2 are complete. You are adding ECO opening identification to the analysis pipeline.

## Current Codebase State

These files exist:
- `backend/src/analysis/schemas/analysis.schema.ts` — Analysis schema. Fields `ecoCode`, `ecoName`, `ecoFamily` exist on the schema but are currently always null after analysis completes.
- `backend/src/stockfish/stockfish.processor.ts` — `StockfishAnalysisProcessor` processes 'analyze' jobs, calls Stockfish per-move, classifies moves, computes accuracy, and updates the MongoDB document to `status: 'completed'`. The ECO fields are not yet populated.
- `backend/data/` directory does NOT exist yet — create it.
- `backend/src/utils/` directory exists (has `move-classifier.ts`).

## What to Create

### File 1: `backend/src/utils/eco-lookup.ts`

Implement the `identify(uciMoves: string[]): { code: string, name: string, family: string } | null` function.

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface EcoEntry {
  code: string;
  name: string;
  family: string;
}

let ecoCache: Record<string, EcoEntry> | null = null;

function loadEco(): Record<string, EcoEntry> {
  if (!ecoCache) {
    // path.join(__dirname, '../../data/eco.json') - adjust based on compiled output location
    const filePath = path.resolve(process.cwd(), 'src/data/eco.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    ecoCache = JSON.parse(raw);
  }
  return ecoCache!;
}

export function identify(uciMoves: string[]): EcoEntry | null {
  if (!uciMoves || uciMoves.length === 0) return null;
  const eco = loadEco();
  // Try longest match first
  for (let i = uciMoves.length; i > 0; i--) {
    const key = uciMoves.slice(0, i).join(' ');
    if (eco[key]) return eco[key];
  }
  return null;
}
```

### File 2: `backend/data/eco.json`

Create this file with at least 20 real ECO entries. Use this exact structure:
```json
{
  "e2e4": { "code": "B00", "name": "King's Pawn Opening", "family": "King's Pawn" },
  "e2e4 c7c5": { "code": "B20", "name": "Sicilian Defence", "family": "Sicilian" },
  "e2e4 c7c5 g1f3": { "code": "B40", "name": "Sicilian Defence, French Variation", "family": "Sicilian" },
  "e2e4 c7c5 g1f3 d7d6": { "code": "B50", "name": "Sicilian Defence", "family": "Sicilian" },
  "e2e4 e7e5": { "code": "C20", "name": "King's Pawn Game", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3": { "code": "C40", "name": "King's Knight Opening", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3 b8c6": { "code": "C44", "name": "King's Knight Opening, Normal Variation", "family": "King's Pawn" },
  "e2e4 e7e5 g1f3 b8c6 f1b5": { "code": "C60", "name": "Ruy Lopez", "family": "Ruy Lopez" },
  "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6": { "code": "C60", "name": "Ruy Lopez, Morphy Defence", "family": "Ruy Lopez" },
  "e2e4 e7e5 g1f3 b8c6 f1c4": { "code": "C55", "name": "Italian Game", "family": "Italian" },
  "e2e4 c7c6": { "code": "B10", "name": "Caro-Kann Defence", "family": "Caro-Kann" },
  "e2e4 d7d6": { "code": "B07", "name": "Pirc Defence", "family": "Pirc" },
  "e2e4 e7e6": { "code": "C00", "name": "French Defence", "family": "French" },
  "e2e4 e7e6 d2d4": { "code": "C02", "name": "French Defence, Advance Variation", "family": "French" },
  "d2d4": { "code": "A40", "name": "Queen's Pawn Game", "family": "Queen's Pawn" },
  "d2d4 d7d5": { "code": "D00", "name": "Queen's Pawn Game", "family": "Queen's Pawn" },
  "d2d4 d7d5 c2c4": { "code": "D06", "name": "Queen's Gambit", "family": "Queen's Gambit" },
  "d2d4 d7d5 c2c4 e7e6": { "code": "D30", "name": "Queen's Gambit Declined", "family": "Queen's Gambit" },
  "d2d4 g8f6": { "code": "A45", "name": "Indian Defence", "family": "Indian" },
  "d2d4 g8f6 c2c4 g7g6": { "code": "E60", "name": "King's Indian Defence", "family": "King's Indian" },
  "g1f3": { "code": "A04", "name": "Reti Opening", "family": "Reti" },
  "c2c4": { "code": "A10", "name": "English Opening", "family": "English" },
  "c2c4 e7e5": { "code": "A20", "name": "English Opening, King's English", "family": "English" }
}
```

## What to Modify

### `backend/src/stockfish/stockfish.processor.ts`

After computing `analyzedMoves` and before calling `findOneAndUpdate`, add:
```typescript
import { identify } from '../utils/eco-lookup';

const ecoResult = identify(job.data.moves);
const ecoCode = ecoResult?.code ?? null;
const ecoName = ecoResult?.name ?? null;
const ecoFamily = ecoResult?.family ?? null;
```

Add `ecoCode`, `ecoName`, `ecoFamily` to the `findOneAndUpdate` call.

## Verification Steps

1. `npm run start:dev`
2. Start a game, play `1. e4 c5` (Sicilian), end the game, trigger analysis
3. GET /analysis/:gameId → should include `"ecoCode": "B20", "ecoName": "Sicilian Defence", "ecoFamily": "Sicilian"`
4. Start a game, play `1. a3 a6` (no ECO match), trigger analysis
5. GET /analysis/:gameId → `"ecoCode": null, "ecoName": null` — no error thrown
6. Confirm analysis still shows `status: 'completed'` even without ECO match
