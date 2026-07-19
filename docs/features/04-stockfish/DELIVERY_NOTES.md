# 04-Stockfish — Delivery Notes

## Acceptance criteria
- [ ] Computer game: after human move, Stockfish responds within 2 seconds at difficulty 1-3, within 5 seconds at difficulty 4-5.
- [ ] Computer move is applied via the same GameGateway move path (validated by chess.js).
- [ ] Stockfish WASM runs in a Web Worker; UI thread is not blocked during computation.
- [ ] Analysis request returns 400 if game is still ongoing.
- [ ] Analysis request returns existing jobId if analysis already requested for this game.
- [ ] BullMQ job processes at depth 18 and produces AnalysisResult in MongoDB.
- [ ] Move classifications follow centipawnLoss thresholds defined in ADR-0027.
- [ ] Analysis status endpoint returns pending/done/failed correctly.

## Edge cases
- Stockfish WASM fails to load: show error state, offer "Play without engine" (no hints, no computer moves).
- Analysis worker times out (> 5 min): mark job as 'failed', allow re-request.
- Very long games (100+ moves): analysis may take > 30s. Show progress (current move / total moves) via a progress event in the BullMQ job.

## Known limitations in v1
- Computer games use WASM with limited depths (max depth 15). Stockfish at full depth would take too long in browser.
- Only one analysis worker process. High demand will queue analysis jobs. Future: scale workers horizontally.
- No engine hints during the game (only post-game analysis).

## Out of scope for v1
- Engine hints during games (next best move suggestions while playing)
- Multiple analysis depths selectable by user
- Opening explorer integrated with analysis
- Endgame tablebase lookups
