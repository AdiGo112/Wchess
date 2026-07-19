# 04-Stockfish — Feature README

## Goal
Provide Stockfish chess engine integration for computer opponent play (in-browser WASM) and deep game analysis (server BullMQ worker).

## User stories
- As a player starting a computer game, Stockfish responds to my moves within 2 seconds at the chosen difficulty.
- As a player who just finished a game, I can request a full analysis and receive move-by-move evaluations with classifications.
- As a developer, computer move computation does not consume server CPU.

## Dependencies
- 02-game-engine: GameGateway dispatches computer move requests; Stockfish worker sends moves back via Redis pub/sub
- 11-analysis: analysis jobs are enqueued from the analysis feature; Stockfish worker is shared

## Output artifacts
### Backend
- BullMQ worker: computer-move queue processor
- BullMQ worker: game-analysis queue processor
- Redis pub/sub channel: stockfish:computer-move-result

### Frontend
- Stockfish WASM Web Worker
- useStockfish hook (wraps Web Worker messaging)
