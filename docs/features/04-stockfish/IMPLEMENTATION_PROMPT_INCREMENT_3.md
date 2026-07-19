# 04-Stockfish — Increment 3 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 3 of Stockfish: browser WASM Web Worker.

## Current state
- Game engine frontend complete (GamePage, useGameSocket, ChessBoard)
- Vite build tool (Web Workers supported via `?worker` import)
- stockfish.js (or stockfish-web) npm package installed

## What to build
Web Worker file that runs Stockfish WASM and a React hook to interact with it.

See IMPLEMENTATION_PROMPT_FRONTEND.md in this feature for the exact code of:
- `frontend/src/workers/stockfish.worker.ts`
- `frontend/src/hooks/useStockfish.ts`

Write these files exactly as specified. Then verify by adding a quick test:
1. In browser console, import the hook and call findBestMove with starting position FEN and depth 3
2. Should return a legal chess move string in 4-5 characters (e.g., 'e2e4')
