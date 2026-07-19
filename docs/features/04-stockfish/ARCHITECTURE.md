# 04-Stockfish — Architecture

## Computer games: browser WASM

```
ChessGame.jsx (React)
    |
    | Web Worker postMessage (UCI: position fen … / go movetime …)
    v
/engine/stockfish-18-lite-single.js  (Web Worker)
    |--- Stockfish WASM (7.3MB, single-threaded — no SharedArrayBuffer,
    |    so no COOP/COEP headers needed). Runs in browser, no server CPU.
    |
    | postMessage ('bestmove e7e5')
    v
useStockfish hook  →  { from, to, promotion }
    |
    | socket emit 'computer_move'   ← NOT 'move': handleMove rejects a move
    v                                 from a socket that doesn't own the turn,
GameGateway (NestJS)                  and black is { id: 'computer' }
    |--- guards: black is computer, sender is the room's white player, black's turn
    |--- chess.js validates the move
    |--- broadcasts move_made to client
```

## Analysis: server BullMQ worker

```
AnalysisController (POST /analysis/request)
    |
    | BullMQ enqueue
    v
analysis-queue (Redis)
    |
    v
StockfishWorker (NestJS BullMQ processor)
    |--- spawn Stockfish binary (child_process)
    |--- send position + go depth 18
    |--- parse output (info depth 18 score cp N bestmove M)
    |--- classify moves (centipawn loss thresholds)
    |
    | store result
    v
MongoDB (AnalysisResult collection)
```

## Key design: no server CPU for computer games
Computer game moves use WASM running in the user's browser. Only the analysis worker runs on the server. This allows unlimited concurrent computer games without server CPU overhead.

## Backend file tree
```
backend/src/stockfish/
├── stockfish.module.ts
├── stockfish.processor.ts   (BullMQ — ANALYSIS ONLY, no computer-move job)
└── stockfish.service.ts     (queueAnalysis)
```
There is deliberately **no** server-side computer-move worker. One existed, contradicted
ADR-0009, and never routed its result back to the client; it was deleted on 2026-07-12.
See IMPLEMENTATION_PLAN_INCREMENT_1.md.

## Frontend file tree
```
frontend/
├── scripts/copy-engine.mjs        (node_modules → public/engine on predev/prebuild)
├── public/engine/                 (gitignored — 7.3MB wasm)
└── src/hooks/useStockfish.js      (owns the Web Worker, speaks UCI)
```
