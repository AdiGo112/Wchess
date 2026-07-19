# Feature 11 — Analysis: Domain Model

## MongoDB Schema

```typescript
// backend/src/analysis/schemas/analysis.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalysisDocument = Analysis & Document;

export type AnalysisStatus = 'pending' | 'completed' | 'failed';
export type MoveClassification = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

class AnalyzedMove {
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
  uci: string;
  fen: string;
  eval: number;           // centipawns, white perspective
  bestMove: string;       // UCI
  bestMoveEval: number;
  cpLoss: number;
  classification: MoveClassification;
  isBrilliant: boolean;
}

class AccuracyScore {
  white: number;   // 0-100
  black: number;
}

@Schema({ timestamps: true })
export class Analysis {
  @Prop({ required: true, unique: true, index: true })
  gameId: string;   // PostgreSQL game UUID

  @Prop({ required: true, enum: ['pending', 'completed', 'failed'], default: 'pending' })
  status: AnalysisStatus;

  @Prop({ required: true, index: true })
  whiteUserId: string;   // PostgreSQL user UUID

  @Prop({ required: true, index: true })
  blackUserId: string;

  @Prop({ type: Object })
  accuracy: AccuracyScore;

  @Prop({ type: [Object], default: [] })
  moves: AnalyzedMove[];

  @Prop()
  ecoCode: string;    // e.g., "B20"

  @Prop()
  ecoName: string;    // e.g., "Sicilian Defence"

  @Prop()
  ecoFamily: string;  // e.g., "Sicilian"

  @Prop()
  error: string;      // Only set when status === 'failed'

  @Prop()
  completedAt: Date;

  // createdAt and updatedAt added by timestamps: true
}

export const AnalysisSchema = SchemaFactory.createForClass(Analysis);
```

## Business Rules and Invariants

- `gameId` is **unique** across the `analysis` collection. Only one analysis document per game exists. Attempting to request analysis for a game that already has a `pending` or `completed` document returns a 409.
- Analysis can only be requested by one of the two players in the game (`whiteUserId` or `blackUserId`). Anyone else gets a 403.
- The `status` field follows a strict state machine: `pending` → `completed` or `pending` → `failed`. There is no transition from `completed` back to `pending`. Re-analysis is not supported in v1.
- `moves` is an ordered array aligned with the game's move list. `moves[0]` is move 1 (White's first move). `moves[1]` is move 2 (Black's first move), etc.
- `eval` values are in centipawns from White's perspective. Positive = White advantage, negative = Black advantage. Checkmate is represented as `±9999` (or `±Infinity` in the processor, normalized to ±9999 before storage).
- `cpLoss` is always `>= 0`. It is computed as `max(0, bestMoveEval - playedMoveEval)` from the moving side's perspective. This is translated: for Black's moves, the comparison is flipped (Black wants lower centipawn evals).
- `accuracy` is computed as: for each player separately, `(brilliantMoves + goodMoves) / totalMoves * 100`, rounded to one decimal place.
- `isBrilliant` is `true` when `cpLoss < 5` AND the move is a sacrifice (moving to a square that was previously attacked by a lower-value piece). Full tactical brilliance detection is an approximation in v1.
- The `error` field is only populated when `status === 'failed'`. It contains a human-readable error string but not a stack trace.
- Analysis documents are **not TTL-expired** — they are permanent records tied to the game.

## Move Classification Thresholds

| Classification | Condition |
|---|---|
| brilliant | cpLoss < 5 AND `isBrilliant === true` |
| good | cpLoss < 20 |
| inaccuracy | cpLoss >= 20 AND < 50 |
| mistake | cpLoss >= 50 AND < 100 |
| blunder | cpLoss >= 100 |

See ADR-0027 for rationale.
