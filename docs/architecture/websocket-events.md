# WebSocket Events

Socket.io connection at `ws://localhost:3100`

**Authentication:** Pass JWT in handshake:
```typescript
const socket = io('http://localhost:3100', {
  auth: { token: `Bearer ${accessToken}` }
});
```
Unauthenticated connections are rejected immediately.

> **One namespace.** Both gateways live on the **default** Socket.io namespace
> (`/`). `GameGateway` authenticates the handshake and populates
> `client.data.userId`; `MatchmakingGateway` shares that connection. There is no
> `/game`, `/matchmaking`, `/chat` or `/notifications` namespace — earlier
> revisions of this file documented those, and none were ever built.

> **Scope.** Chat and notifications were cut from v1 by ADR-0032 and their
> gateways deleted; their event tables have been removed from this file rather
> than left looking live.

---

## Game Gateway (default namespace)

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ roomId: string }` | Join a room. **Players** get `game_start` (and flip a `waiting` room to `active`, starting white's clock) or `game_state` on reconnect. **Non-players** get a one-shot `game_state` snapshot and nothing else — they cannot start the clock or arm the abandonment timer. |
| `move` | `{ roomId, from, to, promotion? }` | Make a move. Always send `promotion` (the client sends `"q"`); without it the server's chess.js rejects every promoting move as illegal. |
| `computer_move` | `{ roomId, from, to, promotion? }` | Relay the move chosen by Stockfish WASM running in the player's own browser (ADR-0009). Accepted **only** when: the room's black player is `computer`, the sender is that room's white (human) player, it is black's turn, and chess.js rules the move legal. Silently ignored otherwise. |
| `resign` | `{ roomId }` | Resign the game |
| `offer_draw` | `{ roomId }` | Offer a draw |
| `accept_draw` | `{ roomId }` | Accept draw offer |
| `decline_draw` | `{ roomId }` | Decline draw offer (also used by the offerer to cancel) |
| `claim_timeout` | `{ roomId }` | Claim opponent's flag (server re-verifies live remaining time). Near-redundant since the 1s server sweeper flags automatically (ADR-0004) — kept for instant client-side resolution |
| `rematch_request` | `{ roomId }` | Request a rematch. The first request emits `rematch_offered` to the room; the second (from the opponent) emits `rematch_ready` with a new room, colors swapped. |
| `join_queue` | `{ timeControl: number, increment?: number }` | Join matchmaking queue (variant derived server-side from `timeControl`) |
| `leave_queue` | `{ timeControl: number }` | Leave matchmaking queue |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `queued` | `{ variant, timeControl }` | Confirmed in queue |
| `left_queue` | `{ variant, timeControl }` | Confirmed removed from queue |
| `queue_position` | `{ position, estimatedWait }` | Position + rough wait (sec), pushed every 5s while queued |
| `match_found` | `{ roomId, color: 'white'\|'black', timeControl, opponent: { id, username, rating } }` | Matched with opponent |
| `challenge_accepted` | `{ roomId, color: 'white'\|'black', timeControl }` | Sent to a challenge **creator** when their friend-challenge link is accepted (REST `/matchmaking/challenge/:token/accept`) so they can navigate into the game |
| `game_start` | `{ roomId, white, black, fen, timeControl, increment, timers, difficulty? }` | Game begins. `difficulty` (1–5) is present only for vs-computer rooms; the client uses it to set the WASM engine's skill level. `black.id === 'computer'` is how the client recognizes a computer game. |
| `game_state` | `{ roomId, white, black, fen, timers, moves, drawOfferedBy, difficulty? }` | Full state — sent to a reconnecting player, and to a non-player who joins to observe (same `difficulty` semantics as `game_start`, so the engine resumes after a refresh) |
| `move_made` | `{ move: MoveDto, fen, turn, timers, check, drawOfferedBy? }` | Move applied. Authoritative — the client applies moves optimistically and reconciles against this. |
| `game_over` | `{ roomId, gameId, result, reason, ratingChange: { white, black } }` | Game ended. Rating changes ship **inside this event**; there is no separate `rating_update`. `gameId` is the persisted `Game` row, so the client can link straight into `/review/:gameId`; it is `null` on vs-computer games, which are never saved. |
| `draw_offered` | `{ byColor }` | Opponent offered draw |
| `draw_declined` | `{}` | Draw offer declined |
| `opponent_disconnected` | `{ roomId, grace: number }` | Opponent left (`grace` in **ms**; 60000). They forfeit if not back in time. |
| `opponent_reconnected` | `{ roomId, color }` | Opponent came back |
| `clock_sync` | `{ roomId, timers: { white: ms, black: ms }, serverTime }` | Authoritative clock correction, pushed every 1s to each active room by the deadline sweeper (ADR-0004); client interpolates between pushes |
| `invalid_move` | `{ roomId, reason }` | Move rejected — the client rolls its optimistic move back to the last server-agreed position |
| `rematch_offered` | `{ byUserId }` | Opponent wants a rematch |
| `rematch_ready` | `{ roomId }` | Both agreed; navigate to the new room (colors swapped) |
| `error` | `{ code?, message }` | Gateway error — `Room not found`, `Not authenticated`, `ALREADY_IN_QUEUE`. The client surfaces these as toasts. |

### Not implemented

`request_takeback` / `accept_takeback` / `decline_takeback`, `takeback_*`,
`premove`, `spectate`, `spectator_count`, and `rating_update` were documented in
earlier revisions but have no handlers. `spectate` was explicitly deleted in the
v1 scope cut; soft-observation via `join_room` replaces it. `create_room` was
removed in the Matchmaking Inc 1 rebuild and is now REST
(`POST /matchmaking/computer` and `/matchmaking/challenge`).

---

## Reconnect contract

Socket.io restores the *connection* but **not** server-side room membership —
`client.join(roomId)` is per-connection. A client that was in a game or a queue
must re-emit on the socket's `connect` event:

- in a game → re-emit `join_room` (`ChessGame.tsx`)
- in a queue → re-emit `join_queue` (`useMatchmakingSocket.ts`)

Without this the socket reconnects but stops receiving `move_made` /
`clock_sync` / `game_over`, and the game silently freezes.

---

## DTOs

```typescript
interface MoveDto {
  from:      string;   // "e2"
  to:        string;   // "e4"
  promotion: string?;  // "q"|"r"|"b"|"n"
  san:       string;   // "e4"
  fen:       string;   // board after move
  moveIndex: number;
}

interface TimerDto {
  white: number;  // ms remaining
  black: number;
}

interface RoomPlayer {
  id:       string;   // 'computer' for the engine
  username: string;
  rating:   number;
}
```
