# Feature 11 — Increment 4: Analysis Board Frontend

## Scope of Work

Build the `/analysis/:gameId` page with the interactive analysis board. Players can step through moves with keyboard arrows or by clicking the move list. The eval bar updates in real time as they navigate. The opening name and accuracy scores are displayed in the header. Board can be flipped.

## Files Created

- `frontend/src/pages/Analysis.jsx`
- `frontend/src/components/AnalysisBoard.jsx`
- `frontend/src/components/EvalBar.jsx`

## Files Modified

- `frontend/src/App.jsx` — add route `/analysis/:gameId` with lazy import

## Acceptance Criteria

1. Navigating to `/analysis/:gameId` when analysis is pending shows a spinner with "Engine analysis in progress…".
2. When analysis is completed, the board renders at starting position.
3. Pressing right arrow advances one move — board FEN changes, eval bar updates.
4. Pressing left arrow goes back one move.
5. Pressing 'f' flips the board.
6. Each move in the sidebar has the correct color: brilliant=cyan, good=green, inaccuracy=yellow-orange, mistake=orange-red, blunder=dark red.
7. The currently selected move is highlighted in the sidebar.
8. Clicking a move in the sidebar jumps to that position.
9. Header shows accuracy for both players and the ECO opening name.
10. Eval bar at +0 cp shows 50/50 split; at +500 cp shows majority white.

## Complexity

**Medium** — State management for move stepping, keyboard event handling, eval bar math, and color-coded move list. React only, no new backend work.
