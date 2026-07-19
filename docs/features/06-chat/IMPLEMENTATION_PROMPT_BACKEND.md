# 06-Chat — Backend Implementation Prompt

Copy and paste to an AI coding assistant.

---

You are implementing the in-game chat backend for ChessWeb: a NestJS application with MongoDB (for message storage), Redis (for rate limiting), and Socket.io (for real-time delivery).

## What already exists
- Auth complete: WsJwtGuard works, extracts userId and username from JWT
- MongoDB client injectable as `@Inject('MONGO_CLIENT') private mongoClient: MongoClient`
- Redis injectable as `@Inject('REDIS_CLIENT') private redis: Redis`
- game-{gameId} Socket.io rooms are created by the GameGateway
- Game state stored in Redis at key `game:{gameId}` as JSON with fields whiteId, blackId

## Task: Build the complete chat backend

### Step 1: Install dependency
`npm install bad-words` — profanity filter library

### Step 2: ChatService

Create `backend/src/chat/chat.service.ts`:

```typescript
import { Filter } from 'bad-words';

@Injectable()
export class ChatService {
  private filter = new Filter();
  private db: Db;

  constructor(
    @Inject('MONGO_CLIENT') private mongoClient: MongoClient,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {
    this.db = this.mongoClient.db(process.env.MONGODB_DB_NAME || 'chessweb');
    // Create TTL index on startup (idempotent)
    this.db.collection('messages').createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 2592000 } // 30 days
    );
    // Create compound index for history queries
    this.db.collection('messages').createIndex({ gameId: 1, createdAt: -1 });
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    const key = `chat:rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      // Set expiry only on first increment (avoids resetting the window)
      await this.redis.expire(key, 1);
    }
    return count <= 1; // true = allowed
  }

  cleanContent(content: string): string {
    try {
      return this.filter.clean(content);
    } catch {
      return content; // If filter throws on an edge case, pass through
    }
  }

  async sendMessage(gameId: string, userId: string, username: string, rawContent: string): Promise<ChatMessageDoc> {
    const content = rawContent.trim();
    if (!content) throw new WsException({ code: 'CONTENT_EMPTY', message: 'Message cannot be empty' });
    if (content.length > 500) throw new WsException({ code: 'CONTENT_TOO_LONG', message: 'Message must be 500 characters or less' });

    const allowed = await this.checkRateLimit(userId);
    if (!allowed) throw new WsException({ code: 'RATE_LIMIT_EXCEEDED', message: 'You are sending messages too quickly. Wait 1 second.' });

    const cleanedContent = this.cleanContent(content);
    const doc: Omit<ChatMessageDoc, '_id'> = { gameId, userId, username, content: cleanedContent, createdAt: new Date() };
    const result = await this.db.collection('messages').insertOne(doc);
    return { _id: result.insertedId, ...doc };
  }

  async getHistory(gameId: string, limit = 50, before?: string): Promise<ChatMessageDoc[]> {
    const query: Record<string, any> = { gameId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    const messages = await this.db.collection('messages')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return messages.reverse() as ChatMessageDoc[]; // Chronological order
  }

  async verifyParticipant(gameId: string, userId: string, redis: Redis): Promise<boolean> {
    const raw = await redis.get(`game:${gameId}`);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return state.whiteId === userId || state.blackId === userId;
  }
}
```

### Step 3: ChatGateway

Create `backend/src/chat/chat.gateway.ts`:

```typescript
@WebSocketGateway({ namespace: '/chat', cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
export class ChatGateway {
  @WebSocketServer() server: Server;
  private typingTimers = new Map<string, NodeJS.Timeout>(); // userId → timeout

  constructor(
    private chatService: ChatService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  @SubscribeMessage('send_message')
  async handleSendMessage(client: Socket, dto: { gameId: string; content: string }) {
    const { userId, username } = client.data;
    const isParticipant = await this.chatService.verifyParticipant(dto.gameId, userId, this.redis);
    if (!isParticipant) {
      client.emit('error', { code: 'NOT_A_PARTICIPANT', message: 'You are not a participant in this game' });
      return;
    }
    try {
      const message = await this.chatService.sendMessage(dto.gameId, userId, username, dto.content);
      // Broadcast to the game room (both players are in this Socket.io room from GameGateway)
      this.server.to(`game-${dto.gameId}`).emit('message_received', {
        id: message._id.toString(),
        gameId: message.gameId,
        userId: message.userId,
        username: message.username,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      });
      // Clear typing indicator when message is sent
      this.clearTypingTimer(userId);
      this.server.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: false });
    } catch (err) {
      client.emit('error', { code: err.message?.code || 'UNKNOWN', message: err.message?.message || 'Error sending message' });
    }
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(client: Socket, dto: { gameId: string }) {
    const { userId, username } = client.data;
    // Broadcast to game room EXCEPT the sender
    client.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: true });
    // Reset auto-stop timer
    this.clearTypingTimer(userId);
    const timer = setTimeout(() => {
      this.server.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: false });
      this.typingTimers.delete(userId);
    }, 5000); // Auto-clear after 5 seconds
    this.typingTimers.set(userId, timer);
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(client: Socket, dto: { gameId: string }) {
    const { userId, username } = client.data;
    this.clearTypingTimer(userId);
    client.to(`game-${dto.gameId}`).emit('typing_indicator', { userId, username, isTyping: false });
  }

  private clearTypingTimer(userId: string) {
    const timer = this.typingTimers.get(userId);
    if (timer) { clearTimeout(timer); this.typingTimers.delete(userId); }
  }
}
```

### Step 4: ChatController

Create `backend/src/chat/chat.controller.ts`:

```typescript
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get(':gameId/history')
  async getHistory(
    @Param('gameId') gameId: string,
    @Query('limit') limit = '50',
    @Query('before') before?: string,
  ) {
    const messages = await this.chatService.getHistory(gameId, Math.min(parseInt(limit), 50), before);
    const nextCursor = messages.length > 0 ? messages[0].createdAt.toISOString() : null;
    return {
      messages: messages.map(m => ({
        id: m._id.toString(),
        gameId: m.gameId,
        userId: m.userId,
        username: m.username,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }
}
```

### Step 5: ChatModule

Create `backend/src/chat/chat.module.ts`:
```typescript
@Module({
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
```

Register ChatModule in AppModule.
