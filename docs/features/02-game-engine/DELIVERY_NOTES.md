# 02-Game-Engine — Delivery Notes

## Acceptance criteria
- [ ] Two authenticated users can join the same game room via Socket.io.
- [ ] White moves first; black's move during white's turn is rejected with NOT_YOUR_TURN.
- [ ] Illegal moves (e.g., moving a rook diagonally) are rejected with ILLEGAL_MOVE.
- [ ] After each move, move_made is broadcast to both players with updated FEN and clocks.
- [ ] Clock counts down on the server; client display shows server time.
- [ ] When white's clock hits 0, black wins (unless insufficient material).
- [ ] Checkmate emits game_over with result and winner.
- [ ] Stalemate emits game_over with result draw.
- [ ] resign emits game_over immediately.
- [ ] offer_draw emits draw_offered to opponent; accept_draw ends the game as draw.
- [ ] Declining draw emits draw_declined and clears the pending offer.
- [ ] If a player disconnects, opponent sees a countdown (30s); player is auto-resigned if they don't reconnect.
- [ ] Completed games are persisted to PostgreSQL with all moves.
- [ ] Rating changes are calculated and applied to both players' User.rating on game end.
- [ ] WebSocket connection requires valid JWT; unauthenticated connections are rejected.

## Edge cases
- Promotion: client must send `promotion: 'q'` (or r/b/n) when moving a pawn to the last rank. Server rejects the move if promotion is missing.
- En passant: chess.js handles this automatically with from/to squares.
- Simultaneous disconnect: if both players disconnect within the grace period, the game is drawn.
- Computer game: no opponent socket. Stockfish moves arrive via Redis pub/sub from the BullMQ worker.

## Known limitations in v1
- No spectator support: socket rooms are limited to the two players.
- No reconnection to in-progress game after page refresh beyond 30s grace period.
- No premoves: client must wait for server to confirm before submitting next move.

## Out of scope for v1
- Chess960 (Fischer Random) variant
- Spectator mode
- Premoves
- Board themes affecting game logic (frontend only)
- Move analysis during the game (that is feature 11)
