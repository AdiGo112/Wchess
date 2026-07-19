# 06-Chat — Workflows

## Workflow 1: Sending a Message

1. Player A is in game /game/abc123 and types "Good move!" in the chat box.
2. As Player A types, their client debounces and emits `typing_start { gameId: 'abc123' }` after 300ms of typing.
3. Player B's client receives `typing_indicator { userId: playerAId, username: 'PlayerA', isTyping: true }` and shows "PlayerA is typing...".
4. Player A finishes typing and presses Enter (or clicks Send).
5. Client emits `send_message { gameId: 'abc123', content: 'Good move!' }`.
6. ChatGateway receives the event:
   a. Verifies Player A is a participant of game abc123 (checks Redis game state).
   b. Validates content: non-empty, ≤ 500 chars.
   c. Redis rate limit check: INCR chat:rate:playerAId → returns 1 (within limit).
   d. Profanity filter: content passes clean (no bad words).
   e. Saves message to MongoDB: `{ gameId, userId: playerAId, username: 'PlayerA', content: 'Good move!', createdAt: now }`.
   f. Broadcasts to room `game-abc123`: `message_received { id, userId, username: 'PlayerA', content: 'Good move!', createdAt }`.
7. Both Player A and Player B receive `message_received` and display the message in the chat panel.
8. Client auto-emits `typing_stop` after the send. Server broadcasts `typing_indicator { isTyping: false }` and Player B's "typing..." indicator disappears.

## Workflow 2: Rate Limit Hit

1. Player A rapidly sends two messages within the same second.
2. First message: INCR chat:rate:playerAId → 1. EXPIRE chat:rate:playerAId 1. Message goes through.
3. Second message (within 1s): INCR chat:rate:playerAId → 2. Gateway emits `error { code: 'RATE_LIMIT_EXCEEDED', message: 'You are sending messages too quickly. Wait 1 second.' }` to Player A only.
4. Second message is NOT saved and NOT broadcast.
5. After 1 second, the Redis key expires and Player A can send again.

## Workflow 3: Loading Chat History

1. Player A returns to an in-progress game (after a browser refresh).
2. The chat panel component mounts and calls GET /chat/abc123/history?limit=50.
3. ChatController authenticates the request (JWT), verifies Player A is a participant.
4. ChatService queries MongoDB: `db.messages.find({ gameId: 'abc123' }).sort({ createdAt: -1 }).limit(50)`.
5. Response: `{ messages: [...], nextCursor: '2026-06-23T10:15:30.000Z' }` (the createdAt of the oldest message).
6. Chat panel renders messages in chronological order (reverse the array before display).
7. If there are more than 50 messages: Player A can scroll up to trigger a second request with `before=nextCursor`.
