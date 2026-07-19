# 02-Game-Engine — Feature README

## Goal
Run authoritative server-side chess games in real time. Both players connect via Socket.io. The server validates every move, manages both clocks, and determines game end conditions.

## User stories
- As a player, when I make a move, it is validated server-side before being broadcast to my opponent.
- As a player, my clock counts down on the server; I cannot manipulate it client-side.
- As a player, if my opponent disconnects, I see a countdown before they are auto-resigned.
- As a player, I can offer a draw; my opponent can accept or decline.
- As a player, I can resign at any time.

## Dependencies
- 01-auth: JwtAuthGuard used to authenticate WebSocket connections
- 03-matchmaking: creates the game room; game-engine consumes it
- 04-stockfish: computer move requests dispatched from GameGateway
- 06-chat: chat is scoped to the game room socket

## Output artifacts
### Socket.io events
Emitted by client: join_room, move, offer_draw, accept_draw, decline_draw, resign, claim_timeout
Emitted by server: game_state, move_made, game_over, draw_offered, draw_declined, clock_update, error

### REST endpoints (via HTTP, not WebSocket)
GET /games/:id — fetch completed game record
GET /games/:id/moves — fetch full move list for a game

### NestJS components
- GameGateway (Socket.io)
- GameService
- ClockService
