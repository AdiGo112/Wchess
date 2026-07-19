# Feature 11 — Analysis

## Goal

Provide every player with an automatic, Stockfish-powered post-game analysis that classifies each move by quality, identifies the opening, computes accuracy scores, and presents the results on an interactive analysis board with an evaluation bar and color-coded move list.

## User Story

As a ChessWeb player, I want my completed games to be automatically analyzed by a chess engine so that I can understand my mistakes, identify blunders, see my accuracy percentage, and learn what the best moves were at each critical moment.

## Depends On

- **Feature 01 — Auth**: Analysis requests are authenticated. The game must belong to the requesting user.
- **Feature 02 — Game Engine**: Game documents (PGN, move list, player IDs) must be stored in MongoDB by the game engine. Analysis reads the game's UCI move list.
- **Feature 04 — Stockfish**: The Stockfish binary integration (child process spawning, UCI protocol) established in Feature 04 is extended here for per-move evaluation.
- **Feature 10 — Notifications** (optional integration): Can trigger a `GAME_RESULT` notification with accuracy % once analysis is complete.

## Output Artifacts

| Artifact | Location |
|---|---|
| Analysis MongoDB schema | `backend/src/analysis/schemas/analysis.schema.ts` |
| Analysis NestJS module | `backend/src/analysis/analysis.module.ts` |
| Analysis REST controller | `backend/src/analysis/analysis.controller.ts` |
| Analysis service | `backend/src/analysis/analysis.service.ts` |
| Stockfish BullMQ processor | `backend/src/stockfish/stockfish.processor.ts` (updated) |
| Move classifier utility | `backend/src/utils/move-classifier.ts` |
| ECO lookup utility | `backend/src/utils/eco-lookup.ts` |
| ECO data file | `backend/data/eco.json` |
| Frontend analysis page | `frontend/src/pages/Analysis.jsx` |
| Analysis board component | `frontend/src/components/AnalysisBoard.jsx` |
| Eval bar component | `frontend/src/components/EvalBar.jsx` |
| Updated ChessGame | `frontend/src/components/ChessGame.jsx` (post-game integration) |
