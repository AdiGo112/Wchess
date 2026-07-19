# 04-Stockfish — Increment 2

## Scope
Backend analysis worker: depth-18 analysis, move classification, MongoDB storage.

## Prerequisites
Increment 1 complete (StockfishService and spawn logic exist).

## Files created
- `backend/src/stockfish/workers/analysis.processor.ts`
- `backend/src/stockfish/analysis.controller.ts`

## Acceptance criteria
- POST /analysis/request enqueues BullMQ job and returns jobId
- Worker processes all moves at depth 18
- AnalysisResult stored in MongoDB with correct classifications
- GET /analysis/:gameId returns result when done
- Analysis of a 40-move game completes in < 120 seconds

## Complexity: L (Large) — ~6-8 hours
