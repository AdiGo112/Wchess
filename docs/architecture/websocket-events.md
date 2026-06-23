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
| `join_queue` | `{ timeControl: number, variant: string }` | Join matchmaking queue |
| `leave_queue` | `{}` | Leave matchmaking queue |
| `create_room` | `{ timeControl: number, variant: string }` | Create invite room |
| `join_room` | `{ roomId: string }` | Join existing room via link |
| `move` | `{ roomId, from, to, promotion? }` | Make a move |
| `resign` | `{ roomId }` | Resign the game |
| `offer_draw` | `{ roomId }` | Offer a draw |
| `accept_draw` | `{ roomId }` | Accept draw offer |
| `decline_draw` | `{ roomId }` | Decline draw offer |
| `claim_timeout` | `{ roomId }` | Claim opponent ran out of time |
| `request_takeback` | `{ roomId }` | Request to undo last move |
| `accept_takeback` | `{ roomId }` | Accept takeback request |
| `decline_takeback` | `{ roomId }` | Decline takeback |
| `premove` | `{ roomId, from, to, promotion? }` | Pre-move (executes on opponent's move) |
| `spectate` | `{ roomId }` | Join as spectator |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `queued` | `{ position, estimatedWait }` | Confirmed in queue |
| `match_found` | `{ roomId, color, opponent: UserDto }` | Matched with opponent |
| `room_created` | `{ roomId }` | Invite room created (share link) |
| `game_start` | `{ roomId, white, black, fen, timeControl, increment }` | Game begins |
| `move_made` | `{ move: MoveDto, fen, turn, timers, check }` | Move applied |
| `game_over` | `{ result, reason, ratingChange: { white, black } }` | Game ended |
| `draw_offered` | `{ byColor }` | Opponent offered draw |
| `draw_declined` | `{}` | Draw offer declined |
| `takeback_requested` | `{ byColor }` | Opponent wants takeback |
| `takeback_accepted` | `{ fen, moves }` | Takeback applied |
| `takeback_declined` | `{}` | Takeback refused |
| `opponent_disconnected` | `{ grace: number }` | Opponent left (grace period in seconds) |
| `opponent_reconnected` | `{}` | Opponent came back |
| `clock_sync` | `{ timers: { white: ms, black: ms }, serverTime }` | Clock correction |
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
