# 06-Chat — Domain Model

## MongoDB: ChatMessage document

```typescript
interface ChatMessage {
  _id: ObjectId;           // Auto-generated MongoDB ObjectId
  gameId: string;          // References PostgreSQL Game.id
  userId: string;          // References PostgreSQL User.id
  username: string;        // Denormalized from User — no JOIN needed on read
  content: string;         // Cleaned by profanity filter before storage
  createdAt: Date;         // TTL index expires document after 30 days
}
```

## TypeScript DTO interfaces

```typescript
export interface SendMessageDto {
  gameId: string;
  content: string;
}

export interface ChatMessageResponse {
  id: string;
  gameId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
}

export interface TypingEventDto {
  gameId: string;
}
```

## Business rules and invariants

1. **Participant-only**: Only the two players in a game (whiteId, blackId from Redis game state) can send or receive messages in that game's chat. The game state is loaded from Redis on every send_message to verify this.

2. **Rate limiting**: A user can send at most 1 message per second. Implemented via Redis INCR on key `chat:rate:{userId}`. The key expires after 1 second. If INCR returns a value > 1, the message is rejected with RATE_LIMIT_EXCEEDED. The key is NOT reset on rejection — the user must wait for natural expiry.

3. **Content length**: Messages must be 1–500 characters after trimming whitespace. Empty or whitespace-only messages return CONTENT_EMPTY.

4. **Profanity filtering**: Content is passed through the `bad-words` npm library's `.clean()` method before storage. The cleaned version is stored in MongoDB and broadcast. The original dirty content is never stored.

5. **Typing indicators are ephemeral**: Typing events are broadcast to the opponent via Socket.io but are NOT saved to MongoDB. They have no persistence.

6. **Auto typing-stop timeout**: If a client emits typing_start but never sends typing_stop (e.g., browser crash), the server emits typing_indicator { isTyping: false } after 5 seconds of no activity. Implemented via a per-userId setTimeout in the gateway.

7. **History pagination**: GET /chat/:gameId/history returns messages sorted by createdAt descending (newest first), with a cursor-based pagination using the createdAt timestamp of the last item as the `before` parameter.
