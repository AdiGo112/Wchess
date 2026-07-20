# WebSocket Events

Socket.io connection at `ws://localhost:3000`

**Authentication:** Pass JWT in handshake:
```typescript
const socket = io('http://localhost:3000', {
  auth: { token: `Bearer ${accessToken}` }
});
```
Unauthenticated connections are rejected immediately.

---

## Game Gateway (`/game` namespace)

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join_queue` | `{ timeControl: number, increment?: number }` | Join matchmaking queue (variant derived server-side from `timeControl`) |
| `leave_queue` | `{ timeControl: number }` | Leave matchmaking queue |
| ~~`create_room`~~ | — | Removed from socket in Matchmaking Inc 1 rebuild — becomes REST `POST /matchmaking/computer` + `/challenge` in Inc 2 |
| `join_room` | `{ roomId: string }` | Join existing room via link |
| `move` | `{ roomId, from, to, promotion? }` | Make a move |
| `computer_move` | `{ roomId, from, to, promotion? }` | Relay the move chosen by Stockfish WASM running in the player's own browser (ADR-0009). Accepted **only** when: the room's black player is `computer`, the sender is that room's white (human) player, it is black's turn, and chess.js rules the move legal. Silently ignored otherwise. |
| `resign` | `{ roomId }` | Resign the game |
| `offer_draw` | `{ roomId }` | Offer a draw |
| `accept_draw` | `{ roomId }` | Accept draw offer |
| `decline_draw` | `{ roomId }` | Decline draw offer |
| `claim_timeout` | `{ roomId }` | Claim opponent's flag (server re-verifies live remaining time). Near-redundant since the 1s server sweeper flags automatically (ADR-0004) — kept for instant client-side resolution |
| `request_takeback` | `{ roomId }` | Request to undo last move |
| `accept_takeback` | `{ roomId }` | Accept takeback request |
| `decline_takeback` | `{ roomId }` | Decline takeback |
| `premove` | `{ roomId, from, to, promotion? }` | Pre-move (executes on opponent's move) |
| `spectate` | `{ roomId }` | Join as spectator |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `queued` | `{ variant, timeControl }` | Confirmed in queue |
| `left_queue` | `{ variant, timeControl }` | Confirmed removed from queue |
| `queue_position` | `{ position, estimatedWait }` | Position + rough wait (sec), pushed every 5s while queued |
| `match_found` | `{ roomId, color: 'white'\|'black', timeControl, opponent: { id, username, rating } }` | Matched with opponent |
| `challenge_accepted` | `{ roomId, color: 'white'\|'black', timeControl }` | Sent to a challenge **creator** when their friend-challenge link is accepted (REST `/matchmaking/challenge/:token/accept`) so they can navigate into the game |
| `error` | `{ code, message }` | Queue error, e.g. `ALREADY_IN_QUEUE` when re-joining a queue you're already in |
| `game_start` | `{ roomId, white, black, fen, timeControl, increment, timers, difficulty? }` | Game begins. `difficulty` (1–5) is present only for vs-computer rooms; the client uses it to set the WASM engine's skill level. `black.id === 'computer'` is how the client recognizes a computer game. |
| `game_state` | `{ roomId, white, black, fen, timers, moves, drawOfferedBy, difficulty? }` | Full state sent to a reconnecting player (same `difficulty` semantics as `game_start`, so the engine resumes after a refresh) |
| `move_made` | `{ move: MoveDto, fen, turn, timers, check }` | Move applied |
| `game_over` | `{ result, reason, ratingChange: { white, black } }` | Game ended |
| `draw_offered` | `{ byColor }` | Opponent offered draw |
| `draw_declined` | `{}` | Draw offer declined |
| `takeback_requested` | `{ byColor }` | Opponent wants takeback |
| `takeback_accepted` | `{ fen, moves }` | Takeback applied |
| `takeback_declined` | `{}` | Takeback refused |
| `opponent_disconnected` | `{ grace: number }` | Opponent left (grace period in seconds) |
| `opponent_reconnected` | `{}` | Opponent came back |
| `clock_sync` | `{ roomId, timers: { white: ms, black: ms }, serverTime }` | Authoritative clock correction, pushed every 1s to each active room by the deadline sweeper (ADR-0004); client interpolates between pushes |
| `invalid_move` | `{ reason }` | Move rejected |
| `spectator_count` | `{ count }` | Spectator count updated |
| `rating_update` | `{ white: { username, newRating, diff }, black: ... }` | Post-game ratings |
| `error` | `{ code, message }` | Game error (GAME_001–GAME_005) |

---

## Matchmaking Gateway (`/matchmaking` namespace)

Handles queue state separately from active games.

| Event (C→S) | Payload | Description |
|---|---|---|
| `get_queue_status` | `{ variant }` | How many in queue right now |

| Event (S→C) | Payload | Description |
|---|---|---|
| `queue_stats` | `{ variant, count, avgWait }` | Queue depth info |

---

## Chat Gateway (`/chat` namespace)

| Event (C→S) | Payload | Description |
|---|---|---|
| `send_message` | `{ roomId, text }` | Send a message |
| `get_history` | `{ roomId, before? }` | Load message history |
| `typing_start` | `{ roomId }` | User is typing |
| `typing_stop` | `{ roomId }` | User stopped typing |

| Event (S→C) | Payload | Description |
|---|---|---|
| `message` | `{ roomId, message: MessageDto }` | New message |
| `history` | `{ roomId, messages: MessageDto[], hasMore }` | History loaded |
| `typing` | `{ roomId, username }` | Someone is typing |

---

## Notification Gateway (`/notifications` namespace)

| Event (S→C) | Payload | Description |
|---|---|---|
| `notification` | `{ id, type, data, createdAt }` | New notification |
| `notification_read` | `{ id }` | Notification marked read (from another tab) |

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

interface UserDto {
  id:       string;
  username: string;
  name:     string;
  avatarUrl: string?;
  rating:   number;
}
```
