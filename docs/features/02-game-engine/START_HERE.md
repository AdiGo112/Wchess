# 02-Game-Engine — Start Here

## What is this feature?
The real-time chess game engine. Handles all in-game logic: joining a room, move validation, server-side clock management, draw offers, disconnect handling, and all terminal states (checkmate, stalemate, timeout, resignation). This is the most complex feature in ChessWeb. All game state lives on the server; the client is a thin view layer.

## Branch
`feature/game-engine` (base off `feature/auth` or `main` after auth is merged)

## Reading order
1. README.md
2. DOMAIN_MODEL.md — Game, Move, and GameRoom entities
3. ARCHITECTURE.md — Socket.io gateway architecture, Redis storage
4. API_DESIGN.md — Socket.io events (not REST)
5. WORKFLOWS.md — join game, make move, timeout, draw, disconnect
6. ADR-0004-server-authoritative-clock.md
7. ADR-0005-chessjs-server-validation.md
8. ADR-0006-redis-game-room-storage.md
9. DELIVERY_NOTES.md
10. AUTOMATED_TESTING_STRATEGY.md + AUTOMATED_TESTING_PROMPT.md
11. IMPLEMENTATION_PROMPT_BACKEND.md + IMPLEMENTATION_PROMPT_FRONTEND.md
12. IMPLEMENTATION_PLAN/PROMPT_INCREMENT_1 through 3
