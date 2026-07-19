# 04-Stockfish — Backend Implementation Prompt

---

Implement the Stockfish backend for ChessWeb: BullMQ worker for computer moves and game analysis.

## What exists
- BullMQ and ioredis installed
- MongoDB connected via MongoClient or Mongoose
- Redis injectable
- Game model in PostgreSQL with PGN field

## Build

### StockfishService (`backend/src/stockfish/stockfish.service.ts`)
Methods:
- async getBestMove(fen: string, depth: number): Promise<string> — spawn Stockfish binary, send UCI commands (position fen {fen}, go depth {depth}), parse "bestmove {move}", kill process
- async analyzePosition(fen: string, depth: number): Promise<{ score: number; bestMove: string }> — similar but also capture "info depth {depth} score cp {N} pv {move}" line
- classifyMove(centipawnLoss: number): MoveClassification
- calculateAccuracy(losses: number[]): number

### AnalysisProcessor (`backend/src/stockfish/workers/analysis.processor.ts`)
BullMQ @Processor('analysis') class:
- Process job: reconstruct game from PGN using chess.js
- For each move in the game: get Stockfish evaluation at depth 18 from StockfishService
- Calculate centipawnLoss for each move
- Classify each move
- Calculate per-player accuracy
- Look up opening from ECO JSON file
- Create AnalysisResult document in MongoDB
- Update job progress (move number / total)

### ComputerMoveProcessor (optional fallback, `backend/src/stockfish/workers/computer-move.processor.ts`)
BullMQ @Processor('computer-move'):
- Process job: call StockfishService.getBestMove(fen, depth)
- Publish result to Redis channel: `stockfish:result:{gameId}`

Write all files now.
