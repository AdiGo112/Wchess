# 02-Game-Engine — API Design (Socket.io Events)

## Client-to-Server events

| Event          | Payload                                              | Description                           |
|----------------|------------------------------------------------------|---------------------------------------|
| join_room      | { gameId: string }                                   | Join a game room after matchmaking    |
| move           | { gameId, from, to, promotion? }                     | Submit a move                         |
| offer_draw     | { gameId }                                           | Offer a draw to opponent              |
| accept_draw    | { gameId }                                           | Accept opponent's draw offer          |
| decline_draw   | { gameId }                                           | Decline opponent's draw offer         |
| resign         | { gameId }                                           | Resign the game                       |
| claim_timeout  | { gameId }                                           | Claim win on time (client reminder)   |

## Server-to-Client events

| Event         | Payload                                                         | Description                          |
|---------------|-----------------------------------------------------------------|--------------------------------------|
| game_state    | { fen, moves, clocks, status, players, turn }                   | Full state on join_room              |
| move_made     | { fen, move, clocks, turn, isCheck, isCheckmate }               | Broadcast after valid move           |
| game_over     | { result, winner?, reason, ratingChange? }                      | Game ended                           |
| draw_offered  | { byUserId }                                                     | Draw offer received                  |
| draw_declined | {}                                                               | Opponent declined draw               |
| clock_update  | { white: number, black: number }                                 | Clock tick (every 1s)               |
| error         | { code: string, message: string }                               | Move rejected or other error         |

## REST endpoints

| Method | Path              | Auth | Description                         |
|--------|-------------------|------|-------------------------------------|
| GET    | /games/:id        | JWT  | Fetch completed game record         |
| GET    | /games/:id/moves  | JWT  | Fetch full move list                |

## Socket authentication

WebSocket connections authenticate via JWT passed in the handshake:
```javascript
// Client side
const socket = io(SERVER_URL, {
  auth: { token: accessToken }
});
```
Server-side: WsJwtGuard extracts and verifies the token from `client.handshake.auth.token`.

## Error codes (emitted via 'error' event)

| Code                  | When                                          |
|-----------------------|-----------------------------------------------|
| ILLEGAL_MOVE          | Move rejected by chess.js                     |
| NOT_YOUR_TURN         | Player moved when it is opponent's turn       |
| GAME_NOT_FOUND        | gameId not in Redis                           |
| GAME_ALREADY_OVER     | Action on a finished game                     |
| NO_DRAW_OFFER         | accept_draw with no pending offer             |
