# 06-Chat — Implementation Plan: Increment 1

## Scope
Backend core: send_message event (MongoDB save + broadcast), get_history REST endpoint (last 50 messages, cursor pagination).

## What gets built
- ChatService with sendMessage() and getHistory()
- ChatGateway (/chat namespace) with handleSendMessage()
- ChatController with GET /chat/:gameId/history
- ChatModule registered in AppModule
- MongoDB TTL index and compound index created on startup

## Exact files created
- `backend/src/chat/chat.module.ts`
- `backend/src/chat/chat.service.ts`
- `backend/src/chat/chat.gateway.ts`
- `backend/src/chat/chat.controller.ts`

Modified:
- `backend/src/app.module.ts` (import ChatModule)

## Acceptance criteria
- [ ] Client emits send_message → message saved to MongoDB with all fields
- [ ] Both players in the game room receive message_received event
- [ ] Non-participant emitting send_message receives NOT_A_PARTICIPANT error
- [ ] GET /chat/:gameId/history returns last 50 messages in chronological order
- [ ] MongoDB TTL index exists: `db.messages.getIndexes()` shows TTL index on createdAt
- [ ] Second history page: GET with before=cursor returns older messages

## Estimated complexity
M (Medium) — ~3-4 hours
