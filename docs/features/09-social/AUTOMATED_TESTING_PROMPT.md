# 09-Social — Automated Testing Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are writing automated tests for Feature 09 — Social (Friendships, Online Presence, Activity Feed) of ChessWeb, a NestJS 10 + React chess platform.

## Tech Stack

- **Backend**: NestJS 10, Prisma + PostgreSQL, ioredis (Redis), Mongoose + MongoDB, Socket.io
- **Testing**: Jest, `@nestjs/testing`, Testcontainers (integration only), Playwright (E2E)
- **Test utilities**: `jest.fn()` for mocks, `createMock` from `@golevelup/ts-jest`

## Backend File Tree

```
src/
├── friendships/
│   ├── friendships.service.ts
│   ├── friendships.controller.ts
│   └── friendships.service.spec.ts       ← write this
├── presence/
│   ├── presence.service.ts
│   └── presence.service.spec.ts          ← write this
└── activity-feed/
    ├── activity-feed.service.ts
    └── activity-feed.service.spec.ts     ← write this
```

## What to Generate

### File 1: `src/friendships/friendships.service.spec.ts`

Write a complete Jest unit test file for `FriendshipService`. Mock `PrismaService` and `PresenceService` using jest mock objects.

Cover these cases:

**sendRequest(requesterId, addresseeId)**
- Returns the created friendship when valid
- Throws `BadRequestException` when `requesterId === addresseeId`
- Throws `NotFoundException` when `prisma.user.findUnique` returns null
- Throws `ForbiddenException` when a BLOCKED row exists in either direction
- Throws `ConflictException` (wrapping Prisma P2002 error) on duplicate

**acceptRequest(friendshipId, currentUserId)**
- Updates status to ACCEPTED and returns updated row when `currentUserId === addresseeId`
- Throws `NotFoundException` when friendship not found
- Throws `ForbiddenException` when `currentUserId !== addresseeId`
- Throws `ConflictException` when status is not PENDING

**declineRequest(friendshipId, currentUserId)**
- Updates status to DECLINED
- Throws `ForbiddenException` when `currentUserId !== addresseeId`

**blockUser(friendshipId, currentUserId)**
- Updates status to BLOCKED
- Throws `ForbiddenException` when user is neither requester nor addressee

**unfriend(friendshipId, currentUserId)**
- Deletes the friendship row
- Throws `ForbiddenException` when user is not a party
- Throws `BadRequestException` when status is not ACCEPTED

**getFriends(userId)**
- Returns array with `isOnline` populated from `PresenceService.getOnlineStatus`
- Correctly extracts "the other user" from each row (handles both requesterId=userId and addresseeId=userId cases)

**getFriendIds(userId)**
- Returns array of friend user IDs for ACCEPTED friendships in both directions

### File 2: `src/presence/presence.service.spec.ts`

Write a complete Jest unit test file for `PresenceService`. Mock the `ioredis` Redis client.

Cover these cases:

**setOnline(userId)**
- Calls `redis.set('user:userId:online', '1', 'EX', 35)`

**setOffline(userId)**
- Calls `redis.del('user:userId:online')`

**isOnline(userId)**
- Returns `true` when `redis.get` returns `'1'`
- Returns `false` when `redis.get` returns `null`

**getOnlineStatus(userIds)**
- Returns array where each element is `true` if key exists, `false` if null
- Returns empty array immediately when passed an empty array

### File 3: `src/activity-feed/activity-feed.service.spec.ts`

Write a complete Jest unit test file for `ActivityFeedService`. Mock the Mongoose model and `FriendshipService`.

Cover these cases:

**publish(entry)**
- Calls `activityFeedModel.create(entry)` with the provided entry
- Catches MongoDB errors and logs them without re-throwing (fire-and-forget behavior)

**getFeed(userId, cursor, limit)**
- Returns `{ entries: [], nextCursor: null, hasMore: false }` when `getFriendIds` returns empty array
- Returns `limit` entries with `hasMore: true` and correct `nextCursor` when MongoDB returns `limit + 1` documents
- Returns fewer than `limit` entries with `hasMore: false` and `nextCursor: null` when fewer docs available
- Passes `_id: { $lt: new Types.ObjectId(cursor) }` to Mongoose when cursor provided
- Does not add cursor filter when cursor is undefined (first page)

## Implementation Reference

Use the following service implementations as the source of truth for what to test.

### FriendshipService (abbreviated)

```typescript
// src/friendships/friendships.service.ts
import { Injectable, BadRequestException, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class FriendshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  async sendRequest(requesterId: string, addresseeId: string) {
    if (requesterId === addresseeId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }
    const addressee = await this.prisma.user.findUnique({ where: { id: addresseeId } });
    if (!addressee) throw new NotFoundException('User not found');

    // Check for BLOCKED in either direction
    const blocked = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId, addresseeId, status: 'BLOCKED' },
          { requesterId: addresseeId, addresseeId: requesterId, status: 'BLOCKED' },
        ],
      },
    });
    if (blocked) throw new ForbiddenException('Cannot send request to this user');

    try {
      return await this.prisma.friendship.create({
        data: { requesterId, addresseeId, status: 'PENDING' },
      });
    } catch (e) {
      if (e?.code === 'P2002') throw new ConflictException('Friend request already exists');
      throw e;
    }
  }

  async acceptRequest(friendshipId: string, currentUserId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: { requester: true },
    });
    if (!friendship) throw new NotFoundException('Friendship not found');
    if (friendship.addresseeId !== currentUserId) {
      throw new ForbiddenException('Only the addressee can accept a request');
    }
    if (friendship.status !== 'PENDING') {
      throw new ConflictException('Request is not in PENDING status');
    }
    return this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
    });
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    });
    return friendships.map(f =>
      f.requesterId === userId ? f.addresseeId : f.requesterId
    );
  }

  async getFriends(userId: string) {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      include: { requester: true, addressee: true },
    });
    const friends = friendships.map(f =>
      f.requesterId === userId ? f.addressee : f.requester
    );
    const onlineStatuses = await this.presenceService.getOnlineStatus(friends.map(f => f.id));
    return friends.map((friend, i) => ({
      id: friend.id,
      username: friend.username,
      avatar: friend.avatar,
      isOnline: onlineStatuses[i],
      lastSeen: friend.lastSeen,
    }));
  }
}
```

### PresenceService (abbreviated)

```typescript
// src/presence/presence.service.ts
import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class PresenceService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async setOnline(userId: string): Promise<void> {
    await this.redis.set(`user:${userId}:online`, '1', 'EX', 35);
  }

  async setOffline(userId: string): Promise<void> {
    await this.redis.del(`user:${userId}:online`);
  }

  async isOnline(userId: string): Promise<boolean> {
    const val = await this.redis.get(`user:${userId}:online`);
    return val !== null;
  }

  async getOnlineStatus(userIds: string[]): Promise<boolean[]> {
    if (userIds.length === 0) return [];
    const results = await Promise.all(userIds.map(id => this.redis.get(`user:${id}:online`)));
    return results.map(v => v !== null);
  }
}
```

### ActivityFeedService (abbreviated)

```typescript
// src/activity-feed/activity-feed.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityFeedEntry } from './schemas/activity-feed-entry.schema';
import { FriendshipService } from '../friendships/friendships.service';

@Injectable()
export class ActivityFeedService {
  private readonly logger = new Logger(ActivityFeedService.name);

  constructor(
    @InjectModel(ActivityFeedEntry.name) private readonly activityFeedModel: Model<ActivityFeedEntry>,
    private readonly friendshipService: FriendshipService,
  ) {}

  async publish(entry: Partial<ActivityFeedEntry>): Promise<void> {
    try {
      await this.activityFeedModel.create(entry);
    } catch (err) {
      this.logger.error('Failed to publish activity feed entry', err);
    }
  }

  async getFeed(userId: string, cursor?: string, limit = 20) {
    const friendIds = await this.friendshipService.getFriendIds(userId);
    if (friendIds.length === 0) {
      return { entries: [], nextCursor: null, hasMore: false };
    }
    const query: any = { actorId: { $in: friendIds } };
    if (cursor) query._id = { $lt: new Types.ObjectId(cursor) };

    const docs = await this.activityFeedModel
      .find(query)
      .sort({ _id: -1 })
      .limit(limit + 1)
      .exec();

    const hasMore = docs.length > limit;
    const entries = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? entries[entries.length - 1]._id.toString() : null;
    return { entries, nextCursor, hasMore };
  }
}
```

## Output Format

Write each file as a complete, runnable Jest test file. Use `describe` and `it` blocks. Use `beforeEach` to set up mocks. Use `expect(...).rejects.toThrow(...)` for exception tests. Do not omit any test case listed above.
