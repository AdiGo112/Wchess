# Feature 11 — Analysis: API Design

## REST Endpoints

| Method | Path | Auth | Request | Response | Error Codes |
|---|---|---|---|---|---|
| POST | `/analysis/request` | JWT | `{ gameId: string }` | `{ status: 'pending', analysisId: string }` | 400, 401, 403, 404, 409 |
| GET | `/analysis/:gameId` | JWT | — | `AnalysisResultDto` or `{ status: 'pending' }` | 401, 404 |

## Status Values

- `pending` — job has been enqueued, Stockfish is working
- `completed` — all moves evaluated, results stored
- `failed` — Stockfish process crashed or timed out (job will not be retried after 3 attempts)

## Key DTOs

```typescript
// POST /analysis/request → 202 Accepted
interface RequestAnalysisResponse {
  status: 'pending';
  analysisId: string;   // MongoDB _id of the analysis document
  message: string;      // "Analysis queued. Poll GET /analysis/:gameId for results."
}

// If analysis already exists (409 or 200 with completed result)
// 409 Conflict is returned if analysis is pending or completed and the user re-requests

// GET /analysis/:gameId — when pending
interface PendingAnalysisDto {
  status: 'pending';
  gameId: string;
}

// GET /analysis/:gameId — when completed
interface AnalysisResultDto {
  status: 'completed';
  gameId: string;
  analysisId: string;
  ecoCode: string;         // e.g., "B20"
  ecoName: string;         // e.g., "Sicilian Defence"
  ecoFamily: string;       // e.g., "Sicilian"
  accuracy: {
    white: number;         // 0-100, percentage
    black: number;
  };
  moves: AnalyzedMoveDto[];
  completedAt: string;     // ISO 8601
}

interface AnalyzedMoveDto {
  moveNumber: number;       // 1-based
  color: 'white' | 'black';
  san: string;              // Standard algebraic notation, e.g., "Nf3"
  uci: string;              // UCI notation, e.g., "g1f3"
  fen: string;              // FEN of position AFTER this move
  eval: number;             // Centipawn eval from white's perspective (+= white advantage)
  bestMove: string;         // UCI of Stockfish's best move from this position
  bestMoveEval: number;     // What eval would have been with best move
  cpLoss: number;           // centipawnLoss = bestMoveEval - eval (always >= 0)
  classification: MoveClassification;
  isBrilliant: boolean;     // Extra flag — cpLoss < 0 AND move is a forcing tactical sequence
}

type MoveClassification = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

// GET /analysis/:gameId — when failed
interface FailedAnalysisDto {
  status: 'failed';
  gameId: string;
  error: string;   // Human-readable reason
}
```

## Error Codes

- **400**: `gameId` missing or invalid UUID format
- **401**: Missing or invalid JWT
- **403**: Game exists but requesting user is not one of the two players
- **404** (POST): Game not found in the database
- **404** (GET): No analysis document exists for this gameId
- **409** (POST): Analysis is already pending or completed for this gameId — poll `GET /analysis/:gameId` instead
