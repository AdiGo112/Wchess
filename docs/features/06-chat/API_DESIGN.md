# 06-Chat — API Design

## Socket.io events (/chat namespace)

### Client → Server

| Event        | Payload                              | Description                              |
|--------------|--------------------------------------|------------------------------------------|
| send_message | { gameId: string, content: string }  | Send a chat message                      |
| typing_start | { gameId: string }                   | Notify opponent that typing has started  |
| typing_stop  | { gameId: string }                   | Notify opponent that typing has stopped  |

### Server → Client

| Event            | Payload                                                          | Description                              |
|------------------|------------------------------------------------------------------|------------------------------------------|
| message_received | { id, userId, username, content, createdAt }                     | New message broadcast to room            |
| typing_indicator | { userId, username, isTyping: boolean }                          | Typing state change                      |
| error            | { code: string, message: string }                                | Error (rate limit, too long, etc.)       |

## REST endpoints

| Method | Path                       | Auth | Query Params          | Response                                   |
|--------|----------------------------|------|-----------------------|--------------------------------------------|
| GET    | /chat/:gameId/history      | JWT  | limit=50, before=ISO  | { messages: ChatMessage[], nextCursor }    |

### ChatMessage response shape

```typescript
interface ChatMessage {
  id: string;           // MongoDB ObjectId as string
  gameId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;    // ISO 8601
}
```

## Socket authentication

```javascript
// Client
const socket = io(SERVER_URL + '/chat', {
  auth: { token: accessToken }
});
```

Server-side: WsJwtGuard extracts token from `client.handshake.auth.token`.

## Error codes (emitted via 'error' event)

| Code                 | When                                        |
|----------------------|---------------------------------------------|
| RATE_LIMIT_EXCEEDED  | More than 1 message per second from user    |
| CONTENT_TOO_LONG     | Message exceeds 500 characters              |
| CONTENT_EMPTY        | Empty or whitespace-only message            |
| NOT_A_PARTICIPANT    | Sender is not whiteId or blackId of game    |
| GAME_NOT_FOUND       | gameId not found in Redis                   |
