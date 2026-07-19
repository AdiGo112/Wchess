# Feature 09 — Social: Backend Implementation Prompt (Increments 1–4)

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained and covers all backend work for the Social feature in a single pass.

---

You are implementing the complete backend for Feature 09 — Social (Friendships, Online Presence, Activity Feed) for ChessWeb, a NestJS 10 + React chess platform targeting 11M+ users.

## Tech Stack

- **NestJS 10** with TypeScript
- **Prisma ORM** + PostgreSQL (existing connection via `PrismaService`)
- **ioredis** for Redis (client injected via `'REDIS_CLIENT'` token from a `RedisModule`)
- **Mongoose** + MongoDB (connection via `MongooseModule.forRoot` in `AppModule`)
- **Socket.io** via `@nestjs/websockets`
- **JWT** via `@nestjs/jwt` (secret in env var `JWT_SECRET`)
- `JwtAuthGuard` exists at `src/auth/guards/jwt-auth.guard.ts`; decorates `req.user.sub` with `userId`

## What Already Exists

- `PrismaModule`, `PrismaService`
- `RedisModule` providing `'REDIS_CLIENT'` (ioredis instance)
- Auth module with `JwtAuthGuard` and `JwtService`
- `GameService` with a method `endGame(gameId, result)` — you will modify it
- `PuzzlesService` with a method `submitSolution(userId, puzzleId, isCorrect)` — you will modify it
- `AppModule` with `MongooseModule.forRoot(process.env.MONGODB_URI)` already registered

## What You Are Building

### Module 1: FriendshipsModule

**REST route prefix**: `/social/friends`

**Prisma schema additions** (add to `prisma/schema.prisma`):

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}

model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  requester   User             @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User             @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([requesterId])
  @@index([addresseeId])
}

model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("UserFollowing", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("UserFollowers", fields: [followingId], references: [id], onDelete: Cascade)

  @@id([followerId, followingId])
  @@index([followingId])
}
```

Add to the `User` model:
```prisma
  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
  following              Follow[]     @relation("UserFollowing")
  followers              Follow[]     @relation("UserFollowers")
```

Run: `npx prisma migrate dev --name add_friendship_follow && npx prisma generate`

**FriendshipService methods**:

| Method | Signature | Business rules |
|--------|-----------|----------------|
| `sendRequest` | `(requesterId, addresseeId) → Friendship` | Reject self-request (400); reject if user not found (404); reject if BLOCKED row in either direction (403); catch P2002 → 409 |
| `acceptRequest` | `(friendshipId, currentUserId) → Friendship` | Only addressee may accept (403); must be PENDING (409) |
| `declineRequest` | `(friendshipId, currentUserId) → Friendship` | Only addressee may decline (403); must be PENDING (409); keeps row as tombstone |
| `blockUser` | `(friendshipId, currentUserId) → Friendship` | Either party may block (must be a party, else 403) |
| `unfriend` | `(friendshipId, currentUserId) → {message}` | Either party may unfriend (must be a party); must be ACCEPTED; deletes the row |
| `getFriends` | `(userId) → {friends, total}` | OR query on requesterId/addresseeId; extract "other user" per row; bulk `PresenceService.getOnlineStatus`; merge `isOnline` |
| `getFriendIds` | `(userId) → string[]` | Same OR query; returns IDs only; used by presence and feed |
| `getIncomingRequests` | `(userId) → {requests}` | PENDING rows where `addresseeId = userId` |
| `getOutgoingRequests` | `(userId) → {requests}` | PENDING rows where `requesterId = userId` |

**FriendshipsController** routes (all `@UseGuards(JwtAuthGuard)`):

```
POST   /social/friends/request            → sendRequest(req.user.sub, body.addresseeId)
POST   /social/friends/:id/accept         → acceptRequest(id, req.user.sub)
POST   /social/friends/:id/decline        → declineRequest(id, req.user.sub)
POST   /social/friends/:id/block          → blockUser(id, req.user.sub)
DELETE /social/friends/:id                → unfriend(id, req.user.sub)
GET    /social/friends                    → getFriends(req.user.sub)
GET    /social/friends/requests/incoming  → getIncomingRequests(req.user.sub)
GET    /social/friends/requests/outgoing  → getOutgoingRequests(req.user.sub)
```

Use `forwardRef(() => PresenceModule)` in `FriendshipsModule` imports to avoid circular dependency.

---

### Module 2: PresenceModule

**Redis key schema**: `user:{userId}:online = "1" EX 35`

**PresenceService methods**:

| Method | Operation |
|--------|-----------|
| `setOnline(userId)` | `redis.set(key, '1', 'EX', 35)` — wrapped in try/catch, logs errors |
| `setOffline(userId)` | `redis.del(key)` — wrapped in try/catch |
| `isOnline(userId)` | `redis.get(key) !== null` — returns false on error |
| `getOnlineStatus(userIds[])` | `Promise.all(userIds.map(id => redis.get(key)))` mapped to booleans — returns all-false on error |

**PresenceGateway** (`@WebSocketGateway({ namespace: '/presence' })`):

- In-memory state: `socketToUser: Map<socketId, userId>`, `userToSockets: Map<userId, Set<socketId>>`
- **handleConnection**: validate JWT from `client.handshake.auth.token` via `JwtService.verify()`; on invalid token call `client.disconnect(true)`; register socket maps; call `setOnline`; if first socket for user, call `notifyFriends(userId, 'friend_online')`
- **handleDisconnect**: look up userId; remove from maps; if last socket, call `setOffline` and `notifyFriends(userId, 'friend_offline')`
- **handleHeartbeat** `@SubscribeMessage('heartbeat')`: call `setOnline(userId)` to refresh TTL
- **notifyFriends**: call `FriendshipService.getFriendIds(userId)`; for each friend, emit event to all their connected sockets via `this.server.to(socketId).emit(event, { userId })`
- **getSocketIdsForUser(userId)**: returns `Array.from(userToSockets.get(userId) ?? [])` — used by controller to emit `friend_request_received` / `friend_accepted`

Use `forwardRef(() => FriendshipsModule)` in `PresenceModule` imports.
Export both `PresenceService` and `PresenceGateway` from `PresenceModule`.

---

### Module 3: ActivityFeedModule

**MongoDB collection**: `activity_feed`

**Mongoose schema** (`ActivityFeedEntry`):

```typescript
{
  actorId: string,           // required, indexed
  actorUsername: string,     // required
  type: string,              // required ('GAME_WON' | 'GAME_LOST' | 'GAME_DRAWN' | 'PUZZLE_SOLVED' | 'ACHIEVEMENT')
  targetId: string | null,   // nullable
  targetName: string | null, // nullable
  metadata: object,          // Mixed, default {}
  createdAt: Date,           // required — TTL index field
}
```

Compound index on schema: `{ actorId: 1, createdAt: -1 }`

TTL index (must be created manually before deploying — do NOT rely on autoIndex):
```javascript
db.activity_feed.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })
```

**ActivityFeedService methods**:

| Method | Behavior |
|--------|----------|
| `publish(dto)` | `activityFeedModel.create(dto)` — fire-and-forget; catch + log errors; never re-throws |
| `getFeed(userId, cursor?, limit=20)` | 1. `getFriendIds(userId)`; if empty return early. 2. Build query `{actorId:{$in:friendIds}}` + optional `{_id:{$lt:ObjectId(cursor)}}`. 3. `.sort({_id:-1}).limit(limit+1).exec()`. 4. Determine `hasMore`; return `{entries, nextCursor, hasMore}` |

**ActivityFeedController**:

```
GET /social/activity-feed    query: { cursor?: string, limit?: number (default 20, max 50) }
```

**Wire into existing services** (fire-and-forget with `void`):
- `GameService.endGame()`: publish `GAME_WON` for winner, `GAME_LOST` for loser (or `GAME_DRAWN` for draws)
- `PuzzlesService.submitSolution()`: publish `PUZZLE_SOLVED` when `isCorrect === true`

Export `ActivityFeedService` from `ActivityFeedModule`. Import `ActivityFeedModule` in `GameModule` and `PuzzlesModule`.

---

## Module Dependency Graph

```
AppModule
├── FriendshipsModule  (imports: PrismaModule, forwardRef(PresenceModule), exports: FriendshipService)
├── PresenceModule     (imports: RedisModule, JwtModule, forwardRef(FriendshipsModule), exports: PresenceService, PresenceGateway)
└── ActivityFeedModule (imports: MongooseModule.forFeature, FriendshipsModule, exports: ActivityFeedService)
    ├── GameModule     (imports: ActivityFeedModule)
    └── PuzzlesModule  (imports: ActivityFeedModule)
```

## File Tree to Produce

```
src/
├── friendships/
│   ├── friendships.module.ts
│   ├── friendships.service.ts
│   ├── friendships.controller.ts
│   └── dto/
│       ├── send-friend-request.dto.ts
│       └── feed-query.dto.ts
├── presence/
│   ├── presence.module.ts
│   ├── presence.service.ts
│   └── presence.gateway.ts
└── activity-feed/
    ├── activity-feed.module.ts
    ├── activity-feed.service.ts
    ├── activity-feed.controller.ts
    └── schemas/
        └── activity-feed-entry.schema.ts
```

Also modify:
- `prisma/schema.prisma`
- `src/game/game.service.ts`
- `src/game/game.module.ts`
- `src/puzzles/puzzles.service.ts`
- `src/puzzles/puzzles.module.ts`
- `src/app.module.ts`

## Verification Sequence

```bash
# After running: npm run start:dev

# 1. Send friend request
curl -X POST http://localhost:3000/social/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"addresseeId":"USER_B_ID"}' | jq .status
# → "PENDING"

# 2. Accept
curl -X POST http://localhost:3000/social/friends/FRIENDSHIP_ID/accept \
  -H "Authorization: Bearer $TOKEN_B" | jq .status
# → "ACCEPTED"

# 3. Verify Redis presence after socket connect
redis-cli GET "user:USER_A_ID:online"
# → "1" (after User A connects to /presence)

# 4. Verify isOnline in friends list
curl http://localhost:3000/social/friends \
  -H "Authorization: Bearer $TOKEN_B" | jq '.friends[0].isOnline'
# → true (if User A's socket is connected)

# 5. Get feed
curl "http://localhost:3000/social/activity-feed?limit=5" \
  -H "Authorization: Bearer $TOKEN_A" | jq .
# → { entries: [...], nextCursor: ..., hasMore: false }

# 6. Confirm self-request rejected
curl -X POST http://localhost:3000/social/friends/request \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"addresseeId":"USER_A_ID"}' | jq .statusCode
# → 400
```
