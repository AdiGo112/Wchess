# Feature 11 — Analysis: Start Here

## What This Feature Does

The Analysis feature gives every ChessWeb player a deep post-game analysis of their completed games powered by Stockfish at depth 18. After a game ends, the system asynchronously evaluates every move, classifies each one as brilliant, good, inaccuracy, mistake, or blunder using centipawn loss thresholds, computes an overall accuracy percentage, identifies the opening by ECO code, and stores all results in MongoDB. Players can then visit `/analysis/:gameId` to replay the game move-by-move with a color-coded sidebar, an engine evaluation bar, and their accuracy summary prominently displayed.

## Branch and Reading Order

Work on branch `feature/11-analysis` branched from `main` (after Feature 10 is merged). Read the docs in this order:

1. **README.md** — goal, user story, and dependencies
2. **ARCHITECTURE.md** — service map showing how Stockfish, BullMQ, and the REST API connect
3. **DOMAIN_MODEL.md** — the MongoDB schema for analysis results and all move classification fields
4. **API_DESIGN.md** — REST endpoints, request/response shapes, and status values
5. **ADR-0026-stockfish-depth-18.md** — why depth 18 was chosen
6. **ADR-0027-move-classification-thresholds.md** — the centipawn loss bands and brilliant detection
7. **ADR-0028-eco-opening-database.md** — the ECO static JSON approach
8. **WORKFLOWS.md** — the full async analysis pipeline from game end to UI display
9. **DASHBOARDS.md** — what analytics could be built on top of analysis data
10. **IMPLEMENTATION_PLAN_INCREMENT_1.md** through **5** — increment-by-increment scope
11. **IMPLEMENTATION_PROMPT_INCREMENT_1.md** through **5** — copy-paste AI prompts per increment
12. **DELIVERY_NOTES.md** — done definition, acceptance criteria, out of scope
13. **AUTOMATED_TESTING_STRATEGY.md** and **AUTOMATED_TESTING_PROMPT.md** — testing plan

## How to Verify It Works

After all increments are implemented: play a complete game (or finish one via resignation). The game service should fire `POST /analysis/request` automatically. Navigate to `/analysis/:gameId` — if analysis is pending, show a spinner. After 10-30 seconds, the page should refresh to show the fully analyzed game. Step through moves with arrow keys. Each move in the sidebar should be color-coded. The eval bar should shift left/right as you step through. The accuracy percentages for both players should appear in the header.
