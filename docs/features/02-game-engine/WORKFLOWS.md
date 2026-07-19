# 02-Game-Engine — Workflows

## Workflow 1: Joining and Starting a Game

1. Matchmaking feature creates a game room in Redis with initial state (FEN = starting position, both clocks set to timeControl).
2. Both players receive a `match_found` Socket.io event with the gameId.
3. Each player's client emits `join_room { gameId }`.
4. GameGateway.handleJoinRoom(): verifies the player is a participant, joins the Socket.io room `game-{gameId}`.
5. GameGateway emits `game_state` to the joining client with full state: { fen, moves, clocks, players, turn }.
6. When both players have joined, the server starts the ClockService timer for the active player (white goes first).
7. White's clock begins counting down. Every second, `clock_update { white, black }` is broadcast to the room.

## Workflow 2: Making a Move

1. White emits `move { gameId, from: 'e2', to: 'e4' }`.
2. GameGateway.handleMove() is called with the client socket.
3. GameService.applyMove():
   a. Load game state from Redis.
   b. Confirm caller is the white player and it is white's turn. If not, emit `error { code: 'NOT_YOUR_TURN' }`.
   c. Load chess.js instance with current FEN.
   d. Call chessInstance.move({ from: 'e2', to: 'e4' }). If returns null, emit `error { code: 'ILLEGAL_MOVE' }`.
   e. Calculate timeTaken = Date.now() - lastMoveTimestamp (or game start for first move).
   f. Add increment to the mover's clock (if increment > 0).
   g. Stop white's clock. Start black's clock.
   h. Update Redis: new FEN, push move to moves array, flip turn to 'black'.
4. Check terminal states:
   - chess.isCheckmate() → game_over { result: 'white_wins', reason: 'checkmate' }
   - chess.isStalemate() → game_over { result: 'draw', reason: 'stalemate' }
   - chess.isInsufficientMaterial() → game_over { result: 'draw', reason: 'insufficient' }
   - chess.isThreefoldRepetition() → game_over { result: 'draw', reason: 'repetition' }
5. Broadcast `move_made { fen, move, clocks, turn, isCheck: chess.isCheck() }` to the room.

## Workflow 3: Timeout

1. ClockService tick detects white's clock has reached 0ms.
2. ClockService calls GameService.handleTimeout(gameId, 'white').
3. Load chess.js instance with current FEN.
4. Check if black has sufficient material: chess.js custom check (kings only = insufficient).
5. If insufficient: result = 'draw', reason = 'insufficient_material_timeout'.
6. Otherwise: result = 'black_wins', reason = 'timeout'.
7. Emit `game_over` to the room.
8. Stop all timers for this game.
9. Persist game to PostgreSQL, calculate rating changes, delete Redis key.

## Workflow 4: Draw Offer

1. White emits `offer_draw { gameId }`.
2. GameService sets pendingDraw = 'white' in Redis.
3. Server emits `draw_offered { byUserId: whiteId }` to the room (black sees it).
4a. Black emits `accept_draw { gameId }`:
   - GameService verifies pendingDraw is set and accepter is not the offerer.
   - Result = 'draw', reason = 'agreement'. persistGame called.
   - Server emits `game_over` to room.
4b. Black emits `decline_draw { gameId }`:
   - GameService clears pendingDraw = null in Redis.
   - Server emits `draw_declined {}` to white.
4c. Black makes a move instead:
   - applyMove clears pendingDraw = null automatically.
   - No draw_declined event is emitted; the offer simply expires.

## Workflow 5: Disconnect and Reconnect

1. Player disconnects (network drop or tab closed).
2. GameGateway.handleDisconnect() fires.
3. Server stores disconnectedAt[userId] = Date.now() in Redis.
4. Server emits `opponent_disconnected { userId, reconnectSeconds: 30 }` to the room.
5. A 30-second setTimeout is started.
6a. Player reconnects within 30s:
   - handleConnection() fires. Timer is cancelled.
   - Server emits `opponent_reconnected { userId }` to the room.
   - Player re-emits join_room to rejoin the socket room and receive current game_state.
6b. Timer fires after 30s with no reconnect:
   - GameService.handleResign(gameId, userId) called with disconnectedAt reason.
   - game_over emitted with reason: 'abandonment'.
   - Game persisted to PostgreSQL.
