# 06-Chat — Automated Testing Prompt

Copy and paste to an AI coding assistant.

---

You are writing automated tests for the in-game chat feature of ChessWeb, a NestJS + React application.

## What already exists (assume complete and working)

Backend:
- `backend/src/chat/chat.service.ts` — ChatService with: sendMessage(gameId, userId, username, content), checkRateLimit(userId), cleanContent(content), getHistory(gameId, limit, before?)
- `backend/src/chat/chat.gateway.ts` — ChatGateway (/chat namespace) with: handleSendMessage, handleTypingStart, handleTypingStop
- `backend/src/chat/chat.controller.ts` — ChatController with GET /chat/:gameId/history

Frontend:
- `frontend/src/components/ChatPanel.tsx` — Chat panel component
- `frontend/src/hooks/useChatSocket.ts` — Hook managing /chat socket connection

## Task: Write all tests

### 1. ChatService unit tests
File: `backend/src/chat/chat.service.spec.ts`

Use Jest. Mock MongoDB collection (`{ insertOne: jest.fn(), find: jest.fn() }`), mock ioredis (`{ incr: jest.fn(), expire: jest.fn() }`), mock `bad-words` Filter class.

Write tests for:
- `sendMessage`: success stores to MongoDB and returns ChatMessage with id; validates length (501 chars → throw); validates empty ('' → throw after trim)
- `checkRateLimit`: Redis INCR returns 1 → returns true (allowed); INCR returns 2 → returns false (blocked)
- `cleanContent`: filters bad words correctly; returns unchanged string when no bad words
- `getHistory`: calls MongoDB find with correct query (gameId match, sort -createdAt, limit); with before parameter adds createdAt < before to query

### 2. Integration tests
File: `backend/src/chat/chat.e2e.spec.ts`

Use real MongoDB (MONGODB_TEST_URL env var), real Redis, two socket.io-client instances both authenticated.

Write tests for:
- send_message → both clients receive message_received with correct fields
- send_message twice within 1s → second receives error RATE_LIMIT_EXCEEDED  
- GET /chat/:gameId/history returns messages sent in previous test
- typing_start → opponent receives typing_indicator { isTyping: true }; typing_stop → isTyping: false
- Non-participant client → send_message → receives NOT_A_PARTICIPANT error

### 3. Frontend ChatPanel tests
File: `frontend/src/__tests__/chat/ChatPanel.test.tsx`

Use Vitest + @testing-library/react. Mock socket.io-client with vi.mock. Mock axios GET /chat/:gameId/history to return 5 seeded messages.

Write tests for:
- ChatPanel renders the 5 seeded messages on mount
- Submit on Enter: type 'Hello' in input, press Enter → socket.emit called with send_message event
- Shift+Enter: no emit, textarea gets newline
- message_received socket event: panel shows new message without page reload
- typing_indicator { isTyping: true }: "Opponent is typing..." text appears
- typing_indicator { isTyping: false }: text disappears
- error event: toast appears
