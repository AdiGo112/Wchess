# Feature 06 — Chat

**Branch:** `feature/chat`
**Depends on:** `feature/auth`

## Goal
Real-time chat inside game rooms and a global lobby chat. Messages stored in MongoDB.

---

## Backend

### Files
```
backend/src/chat/
├── chat.module.ts
├── chat.service.ts     — MongoDB CRUD
├── chat.gateway.ts     — Socket.io events
└── message.schema.ts   — Mongoose schema
```

### Mongoose Schema
```typescript
const MessageSchema = new Schema({
  roomId:   { type: String, required: true, index: true },
  roomType: { type: String, enum: ['game', 'lobby', 'tournament', 'dm'] },
  senderId: { type: String, required: true },
  username: { type: String, required: true },
  text:     { type: String, required: true, maxlength: 500 },
  createdAt:{ type: Date, default: Date.now },
});
MessageSchema.index({ roomId: 1, createdAt: -1 });
// TTL index: game chat auto-deleted after 30 days
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
```

### Socket Events
**Client → Server:**
- `send_message { roomId, text }` — sends a message
- `get_history { roomId, before? }` — loads last 50 messages
- `typing_start { roomId }`, `typing_stop { roomId }`

**Server → Client:**
- `message { roomId, message: MessageDto }` — new message broadcast
- `history { roomId, messages, hasMore }` — history loaded
- `typing { roomId, username }` — typing indicator

### Moderation
- Strip HTML from `text` before storage
- Profanity filter (reject or mask bad words)
- Rate limit: max 1 message per second per user

### REST
```
GET /api/v1/chat/rooms/:roomId/history?before={cursor}&limit=50
```

---

## Frontend

### Component
```
frontend/src/components/chat/ChatPanel.tsx
```

### Features
- Embedded in game sidebar
- Show last 50 messages on load, infinite scroll upward
- Typing indicator ("bob is typing...")
- Message timestamps (relative: "2m ago")
- Auto-scroll to bottom on new message (unless user scrolled up)

---

## Checklist
- [ ] Mongoose `Message` schema + TTL index
- [ ] ChatService: `saveMessage()`, `getHistory()`
- [ ] ChatGateway: all socket events
- [ ] Profanity filter
- [ ] Rate limiting (1 msg/sec per user)
- [ ] REST history endpoint
- [ ] Frontend: ChatPanel component
- [ ] Frontend: typing indicator
- [ ] Frontend: infinite scroll (load older messages)

## Verify
1. Two players in a game → both can send/receive messages in real time
2. Reload page → last 50 messages load from MongoDB
3. Profanity is filtered
4. Typing indicator appears and disappears correctly
5. Messages older than 30 days are auto-deleted
