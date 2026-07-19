# 04-Stockfish — Automated Testing Prompt

Copy and paste to an AI coding assistant.

---

Write automated tests for the Stockfish integration in ChessWeb.

## What exists (assume complete)
- `backend/src/stockfish/stockfish.service.ts` — StockfishService with spawnProcess, getBestMove, analyzeGame
- `backend/src/stockfish/workers/analysis.processor.ts` — BullMQ processor
- `frontend/src/workers/stockfish.worker.ts` — Web Worker
- `frontend/src/hooks/useStockfish.ts` — hook wrapping the worker

## Tests to write

### 1. Unit tests for move classification
File: `backend/src/stockfish/stockfish.service.spec.ts`
Test classifyMove with boundary values: -1 (brilliant), 0 (good), 19 (good), 20 (inaccuracy), 49 (inaccuracy), 50 (mistake), 100 (mistake), 101 (blunder).
Test parseUciOutput with sample Stockfish output strings.
Test calculateAccuracy with arrays of centipawn losses.

### 2. Analysis processor test
File: `backend/src/stockfish/workers/analysis.processor.spec.ts`
Mock StockfishService.getBestMove to return predetermined evaluations for a known game.
Verify AnalysisResult stored in MongoDB has correct structure and classifications.

### 3. Frontend hook test
File: `frontend/src/__tests__/hooks/useStockfish.test.ts`
Mock Web Worker with a fake implementation that returns 'e2e4' for any position.
Test that findBestMove returns a valid 4-character UCI move.
Test that loading state is true during computation.
