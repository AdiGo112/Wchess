# 02-Game-Engine — Automated Testing Strategy

## Unit tests (Jest)

Test GameService in isolation. Mock: PrismaService, Redis client, ClockService, chess.js (partially — allow real chess.js for move validation).

Key scenarios:
- applyMove rejects moves when it is not the player's turn
- applyMove rejects illegal moves (chess.js returns null)
- applyMove updates FEN and move list in Redis
- applyMove detects checkmate and triggers game_over
- applyMove detects stalemate and triggers game_over
- handleTimeout correctly determines draw vs loss based on material
- handleResign sets correct result and persists game
- handleDrawAccept sets draw result and persists game

## Integration tests (Jest + Socket.io client)

Spin up the NestJS app with a real Socket.io server. Use socket.io-client in tests.

Key scenarios:
- Two clients authenticate and join the same game room
- Legal move is broadcast to both clients as move_made
- Illegal move returns error event to mover only
- Timeout is detected within 200ms of clock reaching 0
- Full game: e4 e5 Qh5 Nc6 Bc4 Nf6?? Qxf7# — scholar's mate results in game_over checkmate

## Frontend tests (Vitest + Testing Library)

Test the chess board component in isolation. Mock the socket.

Key scenarios:
- Board renders starting position correctly
- Player can only interact with their own pieces
- After move_made event, board updates to new FEN
- game_over shows modal with result
- Clock display updates on clock_update event
- Offer draw button appears; clicking it emits offer_draw
- Resign button with confirm dialog emits resign

## Coverage targets
- GameService: 85% statement coverage
- GameGateway: 75% (harder due to WS)
- Frontend board component: 70%
