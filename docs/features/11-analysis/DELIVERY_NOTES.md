# Feature 11 — Analysis: Delivery Notes

## "Done" Definition

The feature is done when:
- `POST /analysis/request` for a completed game returns `{ status: 'pending' }` and the BullMQ job is visible in Bull Board.
- Within 30 seconds (for a 30-move game at depth 18), the analysis document in MongoDB transitions to `status: 'completed'` with a full `moves` array.
- `GET /analysis/:gameId` returns the completed analysis with `accuracy.white`, `accuracy.black`, `ecoCode`, and `moves` array with all classifications.
- The `/analysis/:gameId` page renders the board and move list, left/right arrows step through moves, the eval bar updates correctly, and move colors match the classification.
- The game over modal in `ChessGame.jsx` shows accuracy percentages after analysis completes.

## Acceptance Criteria

1. A 20-move game produces an analysis document with exactly 40 `AnalyzedMoveDto` entries (20 per player) in `moves`.
2. Every entry has `classification` set to one of `brilliant|good|inaccuracy|mistake|blunder`.
3. `accuracy.white + accuracy.black` both fall between 0 and 100.
4. `ecoCode` is a valid 3-character ECO code (letter + 2 digits) for any game starting with `1. e4 e5`.
5. A request for a game the user did not play returns 403.
6. A duplicate request for an already-queued game returns 409.
7. Pressing the right arrow key 5 times on the analysis page advances the board through 5 moves, updating the FEN and eval bar each time.
8. `EvalBar` shows roughly 50/50 height split for 0 centipawn eval, and fully white for +500 or more.

## Explicitly Out of Scope in v1

- Real-time "live analysis" during a game — post-game only.
- Multi-line (top 3 moves) analysis — only the best move and centipawn loss per position.
- Opening tree beyond ECO code identification — no move-by-move opening classification.
- Requesting analysis for a game in progress — the `POST /analysis/request` endpoint validates that the game has ended.
- Mobile-optimized analysis board layout — desktop only in v1.
- Sharing analysis or exporting PGN with annotations.
- User-adjustable analysis depth — depth 18 is fixed in v1 (see ADR-0026).

## Known Edge Cases

- **Very short games** (< 5 moves): checkmates and resignations in under 5 moves will still produce an analysis. Accuracy calculation works correctly with small move counts.
- **Stockfish mate scores**: When Stockfish returns `score mate N`, the processor converts this to ±9999 centipawns for storage. The eval bar maxes out at white or black.
- **Long games** (> 100 moves): At depth 18, a 100-move game could take 2+ minutes. The BullMQ job timeout is set to 5 minutes. Games that exceed this timeout transition to `status: 'failed'`.
- **Concurrent analysis jobs**: The BullMQ `stockfish` queue has `concurrency: 2` to avoid overloading the CPU with simultaneous Stockfish processes. Additional jobs queue behind.
- **Rematch or variant games**: ECO lookup is only reliable for standard chess openings. Variant games (Chess960, etc.) may return `null` for ecoCode, which is acceptable — the analysis still proceeds.
- **Analysis board page visited before analysis completes**: The page shows "Engine analysis in progress…" and polls every 5 seconds. The analysis will arrive eventually.
