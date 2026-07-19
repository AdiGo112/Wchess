# 06-Chat — Architecture

## Service map

```
Browser A              Browser B
    |                      |
    | Socket.io             | Socket.io
    | (/chat namespace)     | (/chat namespace)
    v                      v
ChatGateway (NestJS WebSocket, /chat namespace)
    |
    |--- ChatService
    |     |--- MongoDB (messages collection, TTL 30d)
    |     |--- Redis (rate limiting: chat:rate:{userId})
    |     |--- Profanity filter (bad-words library)
    |
    |--- WsJwtGuard (validates JWT from handshake.auth.token)
    |
    |--- Socket.io room: game-{gameId}
         (reuses same room as GameGateway for broadcasting)
```

## Data flow: send_message

```
1. Client A emits: send_message { gameId: 'abc', content: 'Good move!' }
2. WsJwtGuard verifies JWT, sets client.data.userId + client.data.username
3. ChatGateway.handleSendMessage():
   a. Load game state from Redis: verify userId is whiteId or blackId
   b. Validate content: non-empty, length <= 500 chars
   c. Rate limit: INCR chat:rate:{userId} → if > 1, reject with RATE_LIMIT_EXCEEDED
      (EXPIRE is set to 1 on first INCR: Redis auto-resets after 1 second)
   d. Profanity filter: BadWords.clean(content) → replace bad words with ***
   e. Save to MongoDB: { gameId, userId, username, content, createdAt: new Date() }
   f. Broadcast to room game-{gameId}: emit message_received { id, userId, username, content, createdAt }
```

## Data flow: typing indicator

```
1. Client A starts typing → emit typing_start { gameId }
2. ChatGateway broadcasts to game-{gameId} except sender: typing_indicator { userId, username, isTyping: true }
3. Client B shows "Opponent is typing..."
4. Client A stops typing (2s debounce) → emit typing_stop { gameId }
5. ChatGateway broadcasts: typing_indicator { userId, username, isTyping: false }
6. Auto-timeout: if typing_stop not received within 5s, server emits isTyping: false to room
```

## Backend file tree

```
backend/src/chat/
├── chat.module.ts
├── chat.gateway.ts       (Socket.io /chat namespace)
├── chat.service.ts       (MongoDB + Redis + rate limit)
└── chat.controller.ts    (REST: GET /chat/:gameId/history)
```

## MongoDB collection: `messages`

```
{
  _id: ObjectId,
  gameId: string,        // references Game.id
  userId: string,        // references User.id
  username: string,      // denormalized for fast display
  content: string,
  createdAt: Date        // TTL index: expire after 2592000 seconds (30 days)
}

Indexes:
  { createdAt: 1 }  — TTL index (expireAfterSeconds: 2592000)
  { gameId: 1, createdAt: -1 }  — compound for history queries
```
