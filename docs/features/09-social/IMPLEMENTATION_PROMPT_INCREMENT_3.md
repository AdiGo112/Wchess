# Feature 09 — Social: Increment 3 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 3 of the Social feature for ChessWeb, a NestJS 10 + React chess platform.

**Increment 3 goal**: Replace the `PresenceService` stub with a real Redis TTL implementation, and implement `PresenceGateway` — a Socket.io `/presence` namespace that tracks online users, handles heartbeats, and emits `friend_online` / `friend_offline` events.

## Existing Codebase State

- `FriendshipsModule` and `FriendshipService` are fully implemented (Increment 2)
- `PresenceModule` exists with a stub `PresenceService` that returns `false` for all presence checks
- Redis is available via `ioredis`; the `RedisModule` provides the client with token `'REDIS_CLIENT'`
- `JwtService` from `@nestjs/jwt` is available for token verification
- `FriendshipService.getFriendIds(userId)` returns `string[]` of accepted friend IDs

## Files to Replace / Create

### File 1: `src/presence/presence.service.ts` (replace the stub)

```typescript
import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

const PRESENCE_TTL_SECONDS = 35;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  private key(userId: string): string {
    return `user:${userId}:online`;
  }

  async setOnline(userId: string): Promise<void> {
    try {
      await this.redis.set(this.key(userId), '1', 'EX', PRESENCE_TTL_SECONDS);
    } catch (err) {
      this.logger.error(`setOnline failed for ${userId}`, err);
    }
  }

  async setOffline(userId: string): Promise<void> {
    try {
      await this.redis.del(this.key(userId));
    } catch (err) {
      this.logger.error(`setOffline failed for ${userId}`, err);
    }
  }

  async isOnline(userId: string): Promise<boolean> {
    try {
      const val = await this.redis.get(this.key(userId));
      return val !== null;
    } catch (err) {
      this.logger.error(`isOnline failed for ${userId}`, err);
      return false;
    }
  }

  async getOnlineStatus(userIds: string[]): Promise<boolean[]> {
    if (userIds.length === 0) return [];
    try {
      const results = await Promise.all(userIds.map(id => this.redis.get(this.key(id))));
      return results.map(v => v !== null);
    } catch (err) {
      this.logger.error('getOnlineStatus failed', err);
      return userIds.map(() => false);
    }
  }
}
```

### File 2: `src/presence/presence.gateway.ts`

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { FriendshipService } from '../friendships/friendships.service';

@WebSocketGateway({ namespace: '/presence', cors: { origin: '*' } })
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PresenceGateway.name);

  // socketId → userId
  private readonly socketToUser = new Map<string, string>();
  // userId → Set<socketId> (multi-tab support)
  private readonly userToSockets = new Map<string, Set<string>>();

  constructor(
    private readonly presenceService: PresenceService,
    @Inject(forwardRef(() => FriendshipService))
    private readonly friendshipService: FriendshipService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn(`Socket ${client.id} connected without token — disconnecting`);
      client.disconnect(true);
      return;
    }

    let userId: string;
    try {
      const payload = this.jwtService.verify(token) as { sub: string };
      userId = payload.sub;
    } catch {
      this.logger.warn(`Socket ${client.id} has invalid token — disconnecting`);
      client.disconnect(true);
      return;
    }

    // Register socket mappings
    this.socketToUser.set(client.id, userId);
    if (!this.userToSockets.has(userId)) {
      this.userToSockets.set(userId, new Set());
    }
    const sockets = this.userToSockets.get(userId)!;
    const wasOffline = sockets.size === 0;
    sockets.add(client.id);

    // Set online in Redis
    await this.presenceService.setOnline(userId);

    // Notify friends only if this is the first socket (user was offline)
    if (wasOffline) {
      await this.notifyFriends(userId, 'friend_online');
    }

    this.logger.log(`User ${userId} connected (socket ${client.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = this.socketToUser.get(client.id);
    if (!userId) return;

    this.socketToUser.delete(client.id);
    const sockets = this.userToSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      // Only go offline if no remaining active sockets
      if (sockets.size === 0) {
        this.userToSockets.delete(userId);
        await this.presenceService.setOffline(userId);
        await this.notifyFriends(userId, 'friend_offline');
        this.logger.log(`User ${userId} went offline (last socket disconnected)`);
      }
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket): Promise<void> {
    const userId = this.socketToUser.get(client.id);
    if (userId) {
      await this.presenceService.setOnline(userId);
    }
  }

  /**
   * Returns all socket IDs currently connected for a given userId.
   * Used by FriendshipsController to emit friend_request_received / friend_accepted.
   */
  getSocketIdsForUser(userId: string): string[] {
    return Array.from(this.userToSockets.get(userId) ?? []);
  }

  private async notifyFriends(userId: string, event: 'friend_online' | 'friend_offline'): Promise<void> {
    try {
      const friendIds = await this.friendshipService.getFriendIds(userId);
      for (const friendId of friendIds) {
        const friendSocketIds = this.getSocketIdsForUser(friendId);
        for (const socketId of friendSocketIds) {
          this.server.to(socketId).emit(event, { userId });
        }
      }
    } catch (err) {
      this.logger.error(`notifyFriends failed for ${userId}`, err);
    }
  }
}
```

### File 3: `src/presence/presence.module.ts` (replace the stub)

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { FriendshipsModule } from '../friendships/friendships.module';
import { PresenceService } from './presence.service';
import { PresenceGateway } from './presence.gateway';

@Module({
  imports: [
    RedisModule,
    forwardRef(() => FriendshipsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [PresenceService, PresenceGateway],
  exports: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
```

### File 4: Update `src/friendships/friendships.module.ts`

Ensure `forwardRef(() => PresenceModule)` is used in the imports to break the circular dependency:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PresenceModule } from '../presence/presence.module';
import { FriendshipService } from './friendships.service';
import { FriendshipsController } from './friendships.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => PresenceModule)],
  providers: [FriendshipService],
  controllers: [FriendshipsController],
  exports: [FriendshipService],
})
export class FriendshipsModule {}
```

## Verification

```bash
# Start the server
npm run start:dev

# Step 1: Connect a socket to /presence (use a Socket.io client or wscat)
# In a browser console or Node.js script:
# const socket = require('socket.io-client');
# const s = socket('http://localhost:3000/presence', { auth: { token: 'VALID_JWT' } });
# s.on('connect', () => console.log('connected'));

# Step 2: Verify Redis key was set
redis-cli GET "user:USER_ID:online"
# Expected: "1"

redis-cli TTL "user:USER_ID:online"
# Expected: 35 (or close to it)

# Step 3: Send a heartbeat and verify TTL refreshes
# s.emit('heartbeat');
redis-cli TTL "user:USER_ID:online"
# Expected: ~35 again

# Step 4: Disconnect the socket
# s.disconnect();
redis-cli GET "user:USER_ID:online"
# Expected: (nil) — key deleted immediately on graceful disconnect

# Step 5: Verify GET /friends now returns isOnline: true
# Connect User B's socket, then call:
curl http://localhost:3000/social/friends \
  -H "Authorization: Bearer $TOKEN_A"
# Expected: User B has isOnline: true

# Step 6: Connect with invalid token
# const s2 = socket('http://localhost:3000/presence', { auth: { token: 'bad' } });
# s2.on('disconnect', (reason) => console.log(reason));
# Expected: 'io server disconnect' (server forced disconnect)
```
