# 03-Matchmaking — Increment 1 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 1 of the matchmaking backend for ChessWeb: Redis-based queue system with Socket.io events.

## Current state
- Auth complete. WsJwtGuard works.
- Redis available via ioredis injection.
- GameService.createGameRoom(gameId, whiteId, blackId, variant, timeControl, increment) is implemented and working.
- NestJS 10, socket.io are installed.

## What to build
join_queue and leave_queue Socket.io events, 500ms polling loop to pair players, match_found event.

## QueueEntry interface
```typescript
export interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  socketId: string;
  enqueuedAt: number;
  variant: string;
  timeControl: number;
  increment: number;
}
```

## MatchmakingService
`backend/src/matchmaking/matchmaking.service.ts`:

```typescript
@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private socketMap = new Map<string, Socket>(); // userId → socket
  private pollingInterval: NodeJS.Timeout;

  constructor(
    @Inject('REDIS_CLIENT') private redis: Redis,
    private gameService: GameService,
  ) {}

  onModuleInit() {
    this.pollingInterval = setInterval(() => this.poll(), 500);
  }

  onModuleDestroy() { clearInterval(this.pollingInterval); }

  registerSocket(userId: string, socket: Socket) { this.socketMap.set(userId, socket); }
  unregisterSocket(userId: string) { this.socketMap.delete(userId); }

  async enqueue(entry: QueueEntry): Promise<void> {
    const key = `queue:${entry.variant}:${entry.timeControl}`;
    // Remove any existing entry for this user in this queue (prevent duplicates)
    await this.dequeue(entry.userId, entry.variant, entry.timeControl);
    await this.redis.lpush(key, JSON.stringify(entry));
  }

  async dequeue(userId: string, variant: string, timeControl: number): Promise<void> {
    const key = `queue:${variant}:${timeControl}`;
    const entries = await this.redis.lrange(key, 0, -1);
    for (const raw of entries) {
      const entry: QueueEntry = JSON.parse(raw);
      if (entry.userId === userId) {
        await this.redis.lrem(key, 1, raw);
        break;
      }
    }
  }

  toleranceForWait(ms: number): number {
    return Math.min(50 + Math.floor(ms / 1000) * 12, 400);
  }

  private async poll(): Promise<void> {
    // Get all active queue keys
    const keys = await this.redis.keys('queue:*');
    for (const key of keys) {
      const rawEntries = await this.redis.lrange(key, 0, -1);
      if (rawEntries.length < 2) continue;
      
      const entries: QueueEntry[] = rawEntries.map(r => JSON.parse(r));
      const now = Date.now();
      
      // Sort by wait time (longest waiting first = highest priority)
      entries.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      
      let matched = false;
      for (let i = 0; i < entries.length && !matched; i++) {
        for (let j = i + 1; j < entries.length && !matched; j++) {
          const waitI = now - entries[i].enqueuedAt;
          const waitJ = now - entries[j].enqueuedAt;
          // Use the smaller tolerance (stricter matching)
          const tolerance = Math.min(this.toleranceForWait(waitI), this.toleranceForWait(waitJ));
          
          if (Math.abs(entries[i].rating - entries[j].rating) <= tolerance) {
            // Match found! Remove both from queue
            await this.redis.lrem(key, 1, rawEntries[i]);
            await this.redis.lrem(key, 1, rawEntries[j]);
            
            // Randomly assign colors
            const whiteEntry = Math.random() < 0.5 ? entries[i] : entries[j];
            const blackEntry = whiteEntry === entries[i] ? entries[j] : entries[i];
            
            // Create game room
            const gameId = crypto.randomUUID();
            const parts = key.split(':'); // queue:variant:timeControl
            await this.gameService.createGameRoom({
              gameId,
              whiteId: whiteEntry.userId,
              blackId: blackEntry.userId,
              variant: parts[1],
              timeControl: parseInt(parts[2]),
              increment: whiteEntry.increment,
            });
            
            // Notify both players
            const whiteSocket = this.socketMap.get(whiteEntry.userId);
            const blackSocket = this.socketMap.get(blackEntry.userId);
            
            whiteSocket?.emit('match_found', {
              gameId,
              color: 'white',
              opponent: { username: blackEntry.username, rating: blackEntry.rating },
            });
            blackSocket?.emit('match_found', {
              gameId,
              color: 'black',
              opponent: { username: whiteEntry.username, rating: whiteEntry.rating },
            });
            
            matched = true;
          }
        }
      }
    }
  }
}
```

## MatchmakingGateway
`backend/src/matchmaking/matchmaking.gateway.ts`:

```typescript
@WebSocketGateway({ namespace: '/matchmaking', cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private matchmakingService: MatchmakingService) {}

  handleConnection(client: Socket) {
    this.matchmakingService.registerSocket(client.data.userId, client);
  }

  handleDisconnect(client: Socket) {
    this.matchmakingService.unregisterSocket(client.data.userId);
    // Dequeue from all variants (store current queue info in client.data)
    if (client.data.queueVariant) {
      this.matchmakingService.dequeue(client.data.userId, client.data.queueVariant, client.data.queueTimeControl);
    }
  }

  @SubscribeMessage('join_queue')
  async handleJoinQueue(client: Socket, dto: JoinQueueDto) {
    // Get user rating from somewhere (store in JWT payload or fetch from DB)
    const user = await this.usersService.findById(client.data.userId);
    const entry: QueueEntry = {
      userId: client.data.userId,
      username: client.data.username,
      rating: user.rating,
      socketId: client.id,
      enqueuedAt: Date.now(),
      variant: dto.variant,
      timeControl: dto.timeControl,
      increment: dto.increment,
    };
    client.data.queueVariant = dto.variant;
    client.data.queueTimeControl = dto.timeControl;
    await this.matchmakingService.enqueue(entry);
    client.emit('queue_joined', { variant: dto.variant, timeControl: dto.timeControl });
  }

  @SubscribeMessage('leave_queue')
  async handleLeaveQueue(client: Socket, dto: { variant: string; timeControl: number }) {
    await this.matchmakingService.dequeue(client.data.userId, dto.variant, dto.timeControl);
    client.data.queueVariant = null;
    client.emit('queue_left', {});
  }
}
```

## Verification
1. Connect two socket clients with JWTs for two different users
2. Both emit join_queue { variant: 'blitz', timeControl: 300, increment: 0 }
3. Within 1 second, both receive match_found { gameId, color, opponent }
4. Verify game exists in Redis: `redis-cli GET game:{gameId}`
