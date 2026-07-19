# Feature 08 — Puzzles: Increment 4 Implementation Plan

## Scope

Increment 4 delivers the interactive puzzle-solving UI. A user navigates to `/puzzles/:id` and sees a chessboard initialised from the puzzle's FEN. After a 500 ms delay the opponent's first move is played automatically. The user drags pieces to make moves; the frontend validates each move against the stored `moves` array. A correct move triggers the opponent's response (played automatically after 300 ms). An incorrect move flashes the board red and allows a retry. When all user moves are correctly played, the puzzle is marked as solved. A "Give Up" button marks the puzzle as failed at any time. On completion, `POST /puzzles/:id/attempt` is called and the result (rating delta, next review date, quality) is displayed. This increment uses Zustand for attempt state and TanStack Query for data fetching. The `GET /puzzles/stats` authenticated endpoint is also wired up on a `/puzzles/stats` sub-page in this increment.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/pages/PuzzlePage.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleBoard.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleResult.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleControls.tsx` | Create |
| `frontend/src/hooks/usePuzzle.ts` | Create |
| `frontend/src/hooks/useAttemptPuzzle.ts` | Create |
| `frontend/src/store/puzzleSlice.ts` | Create |
| `frontend/src/api/puzzles.ts` | Create |
| `frontend/src/router/index.tsx` | Modify — add `/puzzles/:id` route |

## Acceptance Criteria

- [ ] Navigating to `/puzzles/ETEST01` renders a chessboard with the correct starting position (FEN from API)
- [ ] After 500 ms, the opponent's first move (index 0 in `moves` array) is applied to the board automatically
- [ ] Dragging the correct first user move to the target square causes the move to be accepted and the board to update
- [ ] After the correct move, the opponent's response (index 2 in `moves` array) is played automatically within 300 ms
- [ ] Dragging an incorrect piece to an incorrect square flashes the board red (e.g. adds a CSS class `board-incorrect` for 800 ms) and the position resets to before the wrong move
- [ ] When all user moves in the solution are played, a "Puzzle Solved!" message appears with `data-testid="puzzle-result"`
- [ ] When the user clicks "Give Up", a "Puzzle Failed" message appears and the solution is revealed
- [ ] On completion (solved or failed), `POST /puzzles/:id/attempt` is called with the correct `solved` boolean and `timeTaken` in milliseconds
- [ ] The response rating delta (`+N puzzle rating`) is displayed with `data-testid="rating-delta"`
- [ ] The next review date is displayed (e.g. "Next review in 6 days")
- [ ] Zustand `puzzleSlice` correctly tracks `currentPuzzleId`, `puzzleSolved`, `movesPlayed[]`, and `attemptStartTime`
- [ ] Refreshing the page while on `/puzzles/:id` does not cause a crash (React Query re-fetches the puzzle)

## Complexity

**L** — Large. The interactive board logic is the most complex part of the frontend. Converting drag events to UCI notation, correctly indexing through the `moves` array to distinguish user moves from opponent responses, timing the automatic opponent moves, and handling incorrect move feedback all require careful state management. The Zustand store must not allow submitting an attempt twice (idempotent submit guard).
