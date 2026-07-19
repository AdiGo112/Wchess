# 09-Social — Architecture

## Service Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Client)                           │
│                                                                     │
│  REST calls via axios/fetch          Socket.io /presence namespace  │
│  (JWT Authorization header)          (emit heartbeat every 25s)     │
└──────────────────┬──────────────────────────────┬───────────────────┘
                   │ HTTP                          │ WebSocket
                   ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│     FriendshipsController    │   │         PresenceGateway          │
│  POST /friends/request       │   │  @WebSocketGateway('/presence')  │
│  POST /friends/:id/accept    │   │                                  │
│  POST /friends/:id/decline   │   │  handleConnection(client)        │
│  DELETE /friends/:id         │   │  handleDisconnect(client)        │
│  POST /friends/:id/block     │   │  @SubscribeMessage('heartbeat')  │
│  GET /friends                │   └────────────┬─────────────────────┘
│  GET /friends/requests/*     │                │
│                              │                ▼
│     ActivityFeedController   │   ┌──────────────────────────────────┐
│  GET /feed                   │   │         PresenceService          │
│                              │   │  setOnline(userId)               │
│     UsersController          │   │  setOffline(userId)              │
│  GET /users/search?q=        │   │  isOnline(userId)                │
└──────┬────────┬──────────────┘   │  getOnlineStatus(userIds[])      │
       │        │                  └────────────┬─────────────────────┘
       │        │                               │ MGET / SET EX 35
       │        │                               ▼
       │        │                  ┌──────────────────────────────────┐
       │        │                  │              Redis               │
       │        │                  │  user:{id}:online = "1" EX 35   │
       │        │                  │  (one key per online user)       │
       │        │                  └──────────────────────────────────┘
       │        │
       │        ▼
       │  ┌─────────────────────────────────────────┐
       │  │          FriendshipService              │
       │  │  sendRequest(requesterId, addresseeId)  │
       │  │  acceptRequest(friendshipId, userId)    │
       │  │  declineRequest(friendshipId, userId)   │
       │  │  blockUser(friendshipId, userId)        │
       │  │  unfriend(friendshipId, userId)         │
       │  │  getFriends(userId) → enriched list     │──► PresenceService.getOnlineStatus()
       │  │  getIncomingRequests(userId)            │
       │  │  getOutgoingRequests(userId)            │
       │  └──────────────────┬──────────────────────┘
       │                     │ Prisma ORM
       │                     ▼
       │  ┌──────────────────────────────────────────┐
       │  │           PostgreSQL                     │
       │  │  Friendship table                        │
       │  │  (requesterId, addresseeId, status)      │
       │  └──────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│                   ActivityFeedService                    │
│  publish(entry: ActivityFeedEntry)                       │
│  getFeed(userId, cursor?, limit=20)                      │
│    → queries where actorId IN [friendIds]                │
│    → cursor pagination on _id                            │
└──────────────────────────┬───────────────────────────────┘
                           │ Mongoose
                           ▼
          ┌────────────────────────────────────┐
          │            MongoDB                 │
          │  activity_feed collection          │
          │  TTL index on createdAt (30 days)  │
          └────────────────────────────────────┘
```

---

## Activity Feed Write Path

GameService and PuzzlesService call `ActivityFeedService.publish()` directly — there is no queue for this in Increment 3. BullMQ can be wired in later if throughput requires it.

```
GameService.endGame(gameId, result)
  └─► ActivityFeedService.publish({
        actorId: winner.id,
        actorUsername: winner.username,
        type: ActivityType.GAME_WON,
        targetId: gameId,
        targetName: loser.username,
        metadata: { result, duration, ratingChange },
        createdAt: new Date()
      })
        └─► MongoDB activity_feed.insertOne(document)

PuzzlesService.submitSolution(userId, puzzleId, correct)
  └─► if (correct) ActivityFeedService.publish({
        actorId: userId,
        actorUsername: user.username,
        type: ActivityType.PUZZLE_SOLVED,
        targetId: puzzleId,
        targetName: puzzle.title,
        metadata: { difficulty, timeMs },
        createdAt: new Date()
      })
```

---

## Online Status Enrichment in GET /friends

`FriendshipService.getFriends(userId)` performs two queries — one to PostgreSQL to get the list of friends, then one Redis MGET to bulk-check online status:

```typescript
async getFriends(userId: string): Promise<FriendWithPresence[]> {
  // 1. Query PostgreSQL for accepted friendships
  const friendships = await this.prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: userId, status: 'ACCEPTED' },
        { addresseeId: userId, status: 'ACCEPTED' },
      ],
    },
    include: { requester: true, addressee: true },
  });

  // 2. Extract friend user objects (the other side of each row)
  const friends = friendships.map(f =>
    f.requesterId === userId ? f.addressee : f.requester
  );

  // 3. Bulk Redis MGET for online status
  const onlineStatuses = await this.presenceService.getOnlineStatus(
    friends.map(f => f.id)
  );

  // 4. Merge and return
  return friends.map((friend, i) => ({
    id: friend.id,
    username: friend.username,
    avatar: friend.avatar,
    isOnline: onlineStatuses[i] !== null,
    lastSeen: friend.lastSeen, // stored in User table on disconnect
  }));
}
```

---

## Socket.io /presence Namespace — Online/Offline Detection

```
Client connects to /presence
  → PresenceGateway.handleConnection(client)
      → extracts userId from JWT (client sends token in auth handshake)
      → presenceService.setOnline(userId)      // SET user:{id}:online "1" EX 35
      → notifyFriendsOnline(userId)            // emit friend_online to friends' sockets

Client emits 'heartbeat' every 25s
  → PresenceGateway.handleHeartbeat(client)
      → presenceService.setOnline(userId)      // refresh TTL

Client disconnects (tab close, network drop)
  → PresenceGateway.handleDisconnect(client)
      → presenceService.setOffline(userId)     // DEL user:{id}:online
      → notifyFriendsOffline(userId)           // emit friend_offline to friends' sockets
```

Note: handleDisconnect covers graceful disconnects. The 35s TTL handles ungraceful drops (e.g., browser crash) where handleDisconnect may not fire or fires after delay.

---

## NestJS Module Dependencies

```
AppModule
├── FriendshipsModule
│   ├── imports: [PrismaModule, PresenceModule]
│   ├── providers: [FriendshipService]
│   └── controllers: [FriendshipsController]
├── PresenceModule
│   ├── imports: [RedisModule]
│   ├── providers: [PresenceService, PresenceGateway]
│   └── exports: [PresenceService]   ← FriendshipsModule imports this
├── ActivityFeedModule
│   ├── imports: [MongooseModule.forFeature([ActivityFeedEntry]), FriendshipsModule]
│   ├── providers: [ActivityFeedService]
│   ├── controllers: [ActivityFeedController]
│   └── exports: [ActivityFeedService]  ← GameModule, PuzzlesModule import this
└── UsersModule
    └── controllers: [UsersController]  ← GET /users/search lives here
```

---

## File Tree (Backend)

```
src/
├── friendships/
│   ├── friendships.module.ts
│   ├── friendships.controller.ts
│   ├── friendships.service.ts
│   ├── dto/
│   │   ├── send-friend-request.dto.ts
│   │   └── friendship-response.dto.ts
│   └── friendships.service.spec.ts
├── presence/
│   ├── presence.module.ts
│   ├── presence.gateway.ts
│   ├── presence.service.ts
│   └── presence.service.spec.ts
└── activity-feed/
    ├── activity-feed.module.ts
    ├── activity-feed.controller.ts
    ├── activity-feed.service.ts
    ├── schemas/
    │   └── activity-feed-entry.schema.ts
    └── activity-feed.service.spec.ts
```

## File Tree (Frontend)

```
src/
├── pages/
│   ├── FriendsPage.tsx
│   └── ActivityFeedPage.tsx
├── components/
│   ├── friends/
│   │   ├── FriendCard.tsx
│   │   ├── FriendRequestCard.tsx
│   │   └── UserSearchBar.tsx
│   └── feed/
│       └── FeedItem.tsx
├── hooks/
│   ├── useFriends.ts
│   ├── useFriendRequests.ts
│   ├── useActivityFeed.ts
│   └── usePresence.ts
└── store/
    └── socialSlice.ts
```
