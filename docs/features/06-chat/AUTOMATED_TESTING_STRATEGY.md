# 06-Chat — Automated Testing Strategy

## Unit tests (Jest)

Test ChatService in isolation. Mock: MongoDB collection (MongoClient or Mongoose), Redis client, bad-words library.

**Key scenarios:**
- `sendMessage(gameId, userId, username, content)` — happy path saves to MongoDB and returns the document
- `sendMessage` with content > 500 chars throws ValidationException
- `sendMessage` with empty string after trim throws ValidationException
- `checkRateLimit(userId)` — first call within 1s returns true (allowed); second call returns false (blocked)
- `cleanContent('You are a damn fool')` returns 'You are a **** fool' (profanity replaced)
- `getHistory(gameId, limit=50)` returns documents sorted by createdAt descending, limit respected
- `getHistory(gameId, limit=50, before=timestamp)` returns only documents with createdAt < timestamp

## Integration tests (Jest + Socket.io client + real MongoDB)

Use a test MongoDB database (MONGODB_URL_TEST env var). Use socket.io-client for two client instances.

**Key scenarios:**
- Two clients join game room, client A emits send_message → both clients receive message_received
- Client A emits two messages within 500ms → first succeeds, second receives error { code: RATE_LIMIT_EXCEEDED }
- Message with profanity stored and broadcast with cleaned content
- GET /chat/:gameId/history returns correct messages after 3 sends
- Client disconnects mid-type → after 5s, client B's typing indicator clears (auto-timeout)

## Frontend tests (Vitest + Testing Library)

Mock the socket (vi.mock socket.io-client). Mock axios for history load.

**Key scenarios:**
- ChatPanel renders chat history on mount (GET /chat/:gameId/history)
- Pressing Enter on input field emits send_message event
- Shift+Enter adds newline, does not send
- message_received event appends message to list and auto-scrolls to bottom
- typing_indicator { isTyping: true } shows "Opponent is typing..." text
- typing_indicator { isTyping: false } hides typing text
- error event shows toast notification

## What to mock

- Unit tests: MongoDB (use jest.fn() returning Promise), Redis (jest.fn()), bad-words (jest.mock)
- Integration tests: nothing (real test MongoDB, real Redis test instance)
- Frontend tests: socket.io-client (vi.mock), axios (vi.mock)

## Coverage targets

- ChatService: 85% statement coverage
- ChatGateway: 70% (WebSocket handlers are harder to unit test)
- ChatPanel component: 75%
