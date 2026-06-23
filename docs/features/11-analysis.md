# Feature 11 — Analysis

**Branch:** `feature/analysis`
**Depends on:** `feature/stockfish`, `feature/game-engine`

## Goal
Post-game computer analysis (full Stockfish eval of every position), interactive analysis board, and opening identification.

---

## Backend

### Files
```
backend/src/analysis/
├── analysis.module.ts
├── analysis.service.ts      — queue jobs, fetch results
├── analysis.controller.ts   — REST endpoints
└── analysis.schema.ts       — Mongoose schema
```

### MongoDB Schema
```typescript
{
  gameId:   String,
  userId:   String,   // who requested it
  status:   String,   // "pending" | "processing" | "complete" | "failed"
  positions: [{
    fen:      String,
    eval:     Number,   // centipawns (positive = white better)
    mate:     Number?,  // moves to mate (null if none)
    bestMove: String,   // UCI move
    depth:    Number,
    class:    String,   // "brilliant"|"good"|"inaccuracy"|"mistake"|"blunder"|"miss"
    pv:       String[], // principal variation
  }],
  accuracy: { white: Number, black: Number },  // 0-100%
  openings: [{
    moveIndex: Number,
    eco:       String,
    name:      String,
  }],
  createdAt: Date,
}
```

### Analysis Job Flow
```
POST /analysis/game/:gameId
  → create Analysis doc (status: "pending")
  → enqueue BullMQ job bull:analysis { gameId, moves, depth: 18 }
  → return { jobId }

StockfishProcessor processes:
  → for each position in the game:
      evaluate at depth 18
      classify the move (compare played vs best)
  → calculate accuracy percentages
  → identify openings from ECO table
  → update Analysis doc (status: "complete")
  → emit socket event: analysis_complete { gameId }
```

### Move Classification
```
brilliant  — played move is only good move; eval jumps +0.5+
good       — within 0.2 centipawn loss of best
inaccuracy — 0.2–0.5 centipawn loss
mistake    — 0.5–2.0 centipawn loss
blunder    — >2.0 centipawn loss
miss       — missed a forced win
```

### Endpoints
```
POST /api/v1/analysis/game/:gameId     → 202 { jobId }
GET  /api/v1/analysis/game/:gameId     → AnalysisDto (or 202 if pending)
POST /api/v1/analysis/position         body: { fen, depth?, multipv? } → EvalDto
```

---

## Frontend

### Pages / Components
```
frontend/src/
├── pages/Analysis.tsx             — standalone analysis board
├── components/board/EvalBar.tsx   — vertical evaluation bar
└── components/board/AnalysisArrows.tsx — best move arrows
```

### Analysis Board Features
- Paste FEN or PGN to load position
- Navigate moves with arrow keys or move history clicks
- Stockfish WASM runs in browser (no backend needed for local analysis)
- Eval bar showing centipawn evaluation
- Best move arrow shown after each move
- Multiple line display (top 3 moves)

### Post-Game Analysis View
On Game History page:
- "Request Computer Analysis" button
- Loading state while BullMQ processes
- When complete: move list color-coded (brilliant=teal, good=green, inaccuracy=yellow, mistake=orange, blunder=red)
- Accuracy scores for both players (e.g., "White: 94.2% | Black: 87.5%")
- Opening name shown for first 10-15 moves

---

## Checklist
- [ ] MongoDB Analysis schema
- [ ] AnalysisService: request, get, saveResult
- [ ] BullMQ analysis job → StockfishProcessor
- [ ] Move classification algorithm
- [ ] Accuracy % calculation
- [ ] Opening identification from ECO table
- [ ] Socket event: `analysis_complete`
- [ ] REST endpoints
- [ ] Frontend: Analysis page with WASM Stockfish
- [ ] Frontend: EvalBar component
- [ ] Frontend: AnalysisArrows (best move highlights)
- [ ] Frontend: Post-game analysis view in GameHistory
- [ ] Frontend: Move classification color coding

## Verify
1. `POST /analysis/game/:id` → 202 returned immediately
2. BullMQ processes → MongoDB Analysis doc updated
3. `GET /analysis/game/:id` → complete analysis with classifications
4. Frontend: analysis board loads with eval bar
5. Move through game → eval bar updates
6. Blunders shown in red in move history
7. Accuracy scores shown correctly
