# 04-Stockfish — Automated Testing Strategy

## Unit tests

### StockfishService (backend)
- parseUciOutput: correctly extracts bestmove from "bestmove e2e4" line
- parseScore: correctly extracts centipawn score from "info depth 18 score cp 32" line
- classifyMove(0) → 'good', classifyMove(25) → 'inaccuracy', classifyMove(75) → 'mistake', classifyMove(150) → 'blunder'
- calculateAccuracy([0, 10, 5, 200, 0]) → ~60 (example)

### AnalysisProcessor (BullMQ)
- Mocked StockfishService: test that processor calls stockfish for each move
- Test that result is saved to MongoDB
- Test timeout handling

## Integration tests
These are slow — run in CI only, not in pre-commit hooks.

- Submit a 10-move game for analysis → wait for BullMQ job → verify MongoDB document
- Verify move classifications are correct for known positions

## Frontend tests (Vitest)
- useStockfish: mock Web Worker, test that findBestMove call returns a valid UCI move string
- Test that after computer move, board updates correctly

## What to mock
- In unit tests: child_process.spawn (return controlled Stockfish output), MongoDB
- In integration tests: nothing (real Redis, real MongoDB test DB, real Stockfish binary)
- In frontend tests: Web Worker (vi.mock)
