# Feature 11 — Analysis: Workflows

## Workflow 1 — Requesting and Polling Analysis

1. A chess game ends in `ChessGame.jsx` (via socket event `game_over`).
2. The frontend immediately fires a fire-and-forget `POST /analysis/request` with `{ gameId }`. The response is ignored if it fails (e.g., analysis already exists — 409 is silently caught).
3. The game over modal appears showing the result. A "View Full Analysis" button is present but initially shows a spinner next to it labeled "Analyzing…".
4. The frontend begins polling `GET /analysis/:gameId` every 5 seconds.
5. Each poll returns either `{ status: 'pending' }` or the full `AnalysisResultDto`.
6. When `status === 'completed'` is returned, the modal updates to show `White accuracy: 82% | Black accuracy: 74%` and the "View Full Analysis" button becomes active.
7. Clicking "View Full Analysis" navigates to `/analysis/:gameId`.

## Workflow 2 — Stockfish Per-Move Analysis Pipeline

1. `StockfishAnalysisProcessor` dequeues the job containing `{ gameId, moves: string[] }` where `moves` is the full UCI move list (e.g., `['e2e4', 'e7e5', 'g1f3', ...]`).
2. The processor initializes a `Chess` object from chess.js to track board state.
3. For each move at index `i`:
   a. The current FEN position (before the move) is passed to Stockfish: `position fen <fen>`, then `go depth 18`.
   b. Stockfish returns `bestmove <uci>` and the last `info depth 18 score cp <n>` line.
   c. `bestMoveEval` = the centipawn score from this `info` line.
   d. The played move (`moves[i]`) is applied to the board: `position fen <fen> moves <uci>`, `go depth 18`.
   e. `eval` = the centipawn score after playing the actual move (from the opponent's perspective, so sign-flipped).
   f. `cpLoss` is computed: from White's perspective for White moves, from Black's for Black moves.
   g. `MoveClassifier.classify(cpLoss, isBrilliant)` returns the classification string.
   h. `chess.move(san)` advances the board state for the next iteration.
4. After all moves are processed, `EcoLookup.identify(moves)` is called to get `{ ecoCode, ecoName, ecoFamily }`.
5. Accuracy is computed for each player.
6. The analysis document in MongoDB is updated: `status: 'completed'`, `moves: [...]`, `accuracy`, `ecoCode`, `ecoName`, `ecoFamily`, `completedAt: new Date()`.
7. If Stockfish crashes or times out at any point, the catch block updates the document to `status: 'failed', error: '...'`.

## Workflow 3 — Navigating the Analysis Board

1. User navigates to `/analysis/:gameId`. `Analysis.jsx` calls `GET /analysis/:gameId`.
2. If `status === 'pending'`, show a loading spinner with text "Engine analysis in progress…". Poll every 5 seconds.
3. If `status === 'completed'`, render `<AnalysisBoard analysis={result} />`.
4. `AnalysisBoard` initializes `currentMoveIndex = -1` (starting position) and renders the `react-chessboard` board at the FEN for `moves[currentMoveIndex]`.
5. The sidebar lists all moves with color-coded chips: green (good/brilliant), yellow (inaccuracy), orange (mistake), red (blunder), cyan (brilliant).
6. Right arrow key or click on a move: increments `currentMoveIndex`, updates the board FEN, highlights the selected move in the sidebar, and updates the `EvalBar` with `moves[currentMoveIndex].eval`.
7. Left arrow key: decrements `currentMoveIndex`. At index -1, the board shows the starting position, the eval bar shows 0.
8. `EvalBar` renders a vertical bar: the white portion height = `50 + clamp(eval/10, -50, 50)`% — so 0 cp = 50/50, +500 cp = 100% white, -500 cp = 0% white.
9. Clicking "Flip Board" toggles the board orientation without affecting `currentMoveIndex`.
