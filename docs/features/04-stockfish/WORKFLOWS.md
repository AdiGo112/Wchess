# 04-Stockfish — Workflows

## Workflow 1: Computer Move (Browser WASM)

1. Human player makes a move; GamePage receives move_made from server.
2. GamePage checks: is it the computer's turn? (playerColor !== currentTurn).
3. If yes: useStockfish hook calls stockfish.worker.postMessage({ type: 'findBestMove', fen: currentFen, depth: difficultyDepth }).
4. Stockfish Web Worker initializes WASM (on first call), loads position, runs search.
5. Worker posts result: { type: 'bestMove', move: 'e7e5' } (UCI format).
6. useStockfish hook calls makeMove(move.slice(0,2), move.slice(2,4)) via useGameSocket.
7. GameSocket emits move to the server; server validates with chess.js and broadcasts move_made.
8. Board updates. Human's turn again.

Timing: depth 1 = <50ms, depth 5 = <500ms, depth 15 = 1-3s on modern hardware.

## Workflow 2: Post-Game Analysis Request

1. Human player finishes a game; GameOver modal shows "Analyze Game" button.
2. Player clicks "Analyze Game" → navigate to /analysis/:gameId.
3. AnalysisPage calls GET /analysis/:gameId. If 404 (no analysis yet): calls POST /analysis/request { gameId }.
4. Server validates game is complete, checks no duplicate analysis exists, enqueues BullMQ job.
5. Response: { jobId, estimatedSeconds: 30 }.
6. AnalysisPage polls GET /analysis/:gameId/status every 3 seconds.
7. BullMQ StockfishWorker picks up job:
   a. Reconstruct game from PGN using chess.js.
   b. For each move: get Stockfish evaluation at depth 18.
   c. Calculate centipawnLoss = bestEval - actualMoveEval.
   d. Classify each move.
   e. Calculate accuracy percentages.
   f. Look up opening from ECO database.
   g. Store AnalysisResult in MongoDB.
8. Status changes to 'done'. AnalysisPage renders full analysis board.
