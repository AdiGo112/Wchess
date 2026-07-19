# 04-Stockfish — Domain Model

## MongoDB: AnalysisResult document

```typescript
// MongoDB schema (Mongoose or raw)
interface AnalysisResult {
  _id: string;
  gameId: string;           // references PostgreSQL Game.id
  status: 'pending' | 'done' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  accuracy: {
    white: number;          // 0-100 accuracy percentage
    black: number;
  };
  opening: {
    name: string;           // e.g. 'Sicilian Defense'
    eco: string;            // e.g. 'B20'
    moves: string;          // first moves of opening in SAN
  };
  moves: AnalyzedMove[];
  error?: string;
}

interface AnalyzedMove {
  moveNumber: number;
  color: 'white' | 'black';
  san: string;
  from: string;
  to: string;
  fen: string;              // position after this move
  evaluation: number;       // centipawns (positive = white advantage)
  bestMove: string;         // Stockfish's recommended move in SAN
  centipawnLoss: number;    // how much worse than best move
  classification: MoveClassification;
}

type MoveClassification = 'brilliant' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';
```

## Move classification thresholds (ADR-0027)
- brilliant: centipawnLoss < 0 (found a better move than Stockfish expected)
- good: centipawnLoss < 20
- inaccuracy: centipawnLoss 20-50
- mistake: centipawnLoss 50-100
- blunder: centipawnLoss > 100

## Business rules
1. Only one analysis job per gameId. If a job already exists, return the existing jobId.
2. Analysis is only available for completed games (Game.status != 'ongoing').
3. The analysis worker has a 5-minute timeout; failed jobs are marked as 'failed' with error message.
4. Accuracy is calculated as: 100 - (averageCentipawnLoss / 10), clamped to [0, 100].
5. The WASM Stockfish for computer moves respects the depth limit strictly; it does not think longer than needed.
