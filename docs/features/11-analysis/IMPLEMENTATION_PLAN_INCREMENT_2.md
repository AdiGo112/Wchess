# Feature 11 — Increment 2: Stockfish Per-Move Evaluator + Move Classifier

## Scope of Work

Implement the core analysis engine: `StockfishAnalysisProcessor` processes BullMQ jobs, spawns Stockfish at depth 18 for each board position, computes centipawn loss, classifies each move using the `MoveClassifier` utility, and updates the analysis document in MongoDB. Also implements the `MoveClassifier` pure function and the accuracy percentage computation.

## Files Created

- `backend/src/utils/move-classifier.ts`

## Files Modified

- `backend/src/stockfish/stockfish.processor.ts` — add `analysis` job type handling with per-move UCI evaluation
- `backend/src/analysis/analysis.module.ts` — register updated processor

## Acceptance Criteria

1. After `POST /analysis/request`, within 30 seconds (for a 10-move test game), `GET /analysis/:gameId` returns `{ status: 'completed', moves: [...], accuracy: { white: N, black: N } }`.
2. `moves` array has one entry per half-move (so a 10-move game produces 20 entries).
3. Every `moves[i].classification` is one of `brilliant|good|inaccuracy|mistake|blunder`.
4. `moves[i].cpLoss >= 0` for all entries.
5. `accuracy.white` and `accuracy.black` are both between 0 and 100.
6. If Stockfish binary is not found, the analysis document transitions to `status: 'failed'` with a descriptive `error` string.

## Complexity

**Large** — Spawning child processes, parsing UCI protocol output, handling async streams, integrating chess.js for board state tracking, and complex centipawn math. This is the most technically challenging increment.
