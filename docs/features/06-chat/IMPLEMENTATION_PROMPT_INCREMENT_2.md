# 06-Chat — Implementation Prompt: Increment 2

Copy and paste to an AI coding assistant. Self-contained.

---

You are implementing Increment 2 of the in-game chat feature: rate limiting, profanity filtering, and typing indicators.

## Current state

Increment 1 is complete:
- `backend/src/chat/chat.service.ts` — has sendMessage() and getHistory()
- `backend/src/chat/chat.gateway.ts` — has handleSendMessage()
- bad-words npm package is NOT yet installed

## What to build

1. Rate limiting in ChatService (Redis INCR + EXPIRE)
2. Profanity filtering (bad-words library)
3. typing_start / typing_stop handlers in ChatGateway
4. 5-second server-side typing auto-timeout

## Step 1: Install bad-words

```bash
cd backend && npm install bad-words @types/bad-words
```

## Step 2: Update ChatService

Add to `backend/src/chat/chat.service.ts`:

```typescript
import { Filter } from 'bad-words';

// In class:
private profanityFilter = new Filter();

async checkRateLimit(userId: string): Promise<boolean> {
  const key = `chat:rate:${userId}`;
  const count = await this.redis.incr(key);
  if (count === 1) {
    // Only set expire on first increment (avoids extending the window on subsequent calls)
    await this.redis.expire(key, 1);
  }
  return count <= 1;
}

cleanContent(content: string): string {
  try {
    return this.profanityFilter.clean(content);
  } catch {
    return content; // Handle edge cases gracefully
  }
}
```

Update `sendMessage()` to call these:
```typescript
async sendMessage(gameId, userId, username, content) {
  const trimmed = content.trim();
  if (!trimmed) throw ...CONTENT_EMPTY...
  if (trimmed.length > 500) throw ...CONTENT_TOO_LONG...
  
  // ADD: rate limit check
  const allowed = await this.checkRateLimit(userId);
  if (!allowed) throw new Error(JSON.stringify({ code: 'RATE_LIMIT_EXCEEDED', message: 'You are sending messages too fast. Wait 1 second.' }));
  
  // ADD: profanity filter
  const cleanedContent = this.cleanContent(trimmed);
  
  const doc = { gameId, userId, username, content: cleanedContent, createdAt: new Date() };
  // ... rest same as before
}
```

## Step 3: Update ChatGateway

Add typing handlers to `backend/src/chat/chat.gateway.ts`:

```typescript
private typingTimers = new Map<string, NodeJS.Timeout>();

@SubscribeMessage('typing_start')
handleTypingStart(
  @ConnectedSocket() client: Socket,
  @MessageBody() dto: { gameId: string },
) {
  const { userId, username } = client.data;
  // Broadcast to game room excluding sender
  client.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: true });
  
  // Auto-clear after 5s
  if (this.typingTimers.has(userId)) clearTimeout(this.typingTimers.get(userId)!);
  const timer = setTimeout(() => {
    this.server.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: false });
    this.typingTimers.delete(userId);
  }, 5000);
  this.typingTimers.set(userId, timer);
}

@SubscribeMessage('typing_stop')
handleTypingStop(
  @ConnectedSocket() client: Socket,
  @MessageBody() dto: { gameId: string },
) {
  const { userId, username } = client.data;
  if (this.typingTimers.has(userId)) {
    clearTimeout(this.typingTimers.get(userId)!);
    this.typingTimers.delete(userId);
  }
  client.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: false });
}
```

## Verification

```bash
# Rate limit test: send two messages rapidly
# First message → success (message_received received)
# Second message within 1s → error { code: 'RATE_LIMIT_EXCEEDED' }

# Profanity test: send a message with a bad word
# socket.emit('send_message', { gameId: '...', content: 'You are an ass!' })
# Expected broadcast: "You are an ***!"

# Typing test:
# Tab A: socket.emit('typing_start', { gameId: '...' })
# Tab B: receives typing_indicator { isTyping: true }
# Wait 5 seconds (no typing_stop sent)
# Tab B: receives typing_indicator { isTyping: false } automatically
```
