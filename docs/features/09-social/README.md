# 09-Social — Feature Overview

## What This Feature Does

The Social feature adds three layers of player connection to ChessWeb:

### 1. Bidirectional Friendships

Players can send friend requests to other players. The flow is:

```
Requester sends request → Addressee receives notification
Addressee accepts → Both players are now friends
                  → Requester receives friend_accepted event
Addressee declines → Friendship row stays as DECLINED (prevents re-request spam)
Either party blocks → BLOCKED status; blocked user cannot send future requests
Either party unfriends → Row deleted or set back to DECLINED
```

Friendship is **bidirectional by query, not by storage** — one row is created per friendship, and both users appear in each other's friends list via an OR query on `requesterId` / `addresseeId`.

### 2. Online Presence

Online presence is tracked using Redis TTL keys. The client emits a `heartbeat` event to the Socket.io `/presence` namespace every **25 seconds**. The server refreshes `user:{id}:online` with a **35-second TTL** on each heartbeat. If the client disconnects and stops heartbeating, the key expires and the user is considered offline.

When a friend comes online or goes offline, the server emits `friend_online` / `friend_offline` events to all of that user's connected friends.

### 3. Activity Feed

When a player completes a game, solves a puzzle, or unlocks an achievement, an entry is published to MongoDB's `activity_feed` collection. Each player's feed shows recent activity from their accepted friends, sorted by most recent first. Entries expire automatically after **30 days** via a MongoDB TTL index.

---

## Prisma Model

```prisma
model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  requester   User             @relation("FriendshipRequester", fields: [requesterId], references: [id])
  addresseeId String
  addressee   User             @relation("FriendshipAddressee", fields: [addresseeId], references: [id])
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  @@unique([requesterId, addresseeId])
  @@index([requesterId])
  @@index([addresseeId])
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}
```

The `User` model in `schema.prisma` requires two relation fields to accommodate both sides of the friendship:

```prisma
model User {
  // ... existing fields ...
  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
}
```

---

## MongoDB Activity Feed Schema

Collection: `activity_feed`

```typescript
// ActivityFeedEntry document shape
{
  _id: ObjectId,              // used as pagination cursor
  actorId: string,            // userId of the person who did the action
  actorUsername: string,      // denormalized for display without JOIN
  type: ActivityType,         // see enum below
  targetId: string | null,    // gameId, puzzleId, or achievementId
  targetName: string | null,  // game opponent username, puzzle title, achievement name
  metadata: Record<string, unknown>, // type-specific extra data (e.g., { result: 'WIN', opponent: 'bob' })
  createdAt: Date             // TTL index field
}
```

```typescript
enum ActivityType {
  GAME_STARTED   = 'GAME_STARTED',
  GAME_WON       = 'GAME_WON',
  GAME_LOST      = 'GAME_LOST',
  GAME_DRAWN     = 'GAME_DRAWN',
  PUZZLE_SOLVED  = 'PUZZLE_SOLVED',
  ACHIEVEMENT    = 'ACHIEVEMENT',
}
```

TTL index: `{ createdAt: 1 }, { expireAfterSeconds: 2592000 }` (30 days = 30 × 24 × 3600)

---

## User Stories

- As a player, I can search for other players by username and send them a friend request.
- As a player, I can accept or decline incoming friend requests.
- As a player, I can see which of my friends are currently online (green dot in friends list).
- As a player, I can see a real-time notification when a friend comes online.
- As a player, I can view a feed of recent activity from my friends (games won, puzzles solved, achievements).
- As a player, I can block another user to prevent them from contacting me.

---

## Dependencies

| Dependency | Why |
|---|---|
| `01-auth` | All endpoints require JWT; `userId` from token payload |
| `@nestjs/mongoose` | ActivityFeedEntry schema and MongoDB connection |
| `ioredis` | Redis SET/GET/MGET/DEL for presence keys |
| `@nestjs/websockets` + `socket.io` | `/presence` namespace gateway |
| `GameService` | Calls `ActivityFeedService.publish()` on game end |
| `PuzzlesService` | Calls `ActivityFeedService.publish()` on puzzle solve |
