# 09-Social — Automated Testing Strategy

## Overview

This document defines the testing pyramid for Feature 09 — Social. Tests are organized into three tiers: unit, integration, and end-to-end. All tests live in the backend or frontend source trees alongside the code they test.

---

## Tier 1 — Unit Tests

Unit tests cover service logic in isolation. External dependencies (Prisma, Redis, MongoDB, Socket.io) are mocked.

### FriendshipService (`friendships.service.spec.ts`)

| Test Case | Description |
|---|---|
| `sendRequest` — happy path | Creates a PENDING row; returns 201 DTO |
| `sendRequest` — self-request | Throws `BadRequestException` when `requesterId === addresseeId` |
| `sendRequest` — user not found | Throws `NotFoundException` when addressee does not exist in Prisma mock |
| `sendRequest` — duplicate (P2002) | Catches Prisma `P2002` and re-throws `ConflictException` |
| `sendRequest` — blocked user | Throws `ForbiddenException` when a BLOCKED row exists in either direction |
| `acceptRequest` — happy path | Updates status to ACCEPTED; returns updated row |
| `acceptRequest` — wrong user | Throws `ForbiddenException` when `currentUserId !== addresseeId` |
| `acceptRequest` — not PENDING | Throws `ConflictException` when status is not PENDING |
| `declineRequest` — happy path | Updates status to DECLINED |
| `declineRequest` — wrong user | Throws `ForbiddenException` |
| `blockUser` — happy path | Updates status to BLOCKED |
| `blockUser` — not a party | Throws `ForbiddenException` |
| `unfriend` — happy path | Deletes the row |
| `unfriend` — not ACCEPTED | Throws `BadRequestException` when status is not ACCEPTED |
| `getFriends` — enriches with presence | Calls `PresenceService.getOnlineStatus`; merges `isOnline` into result |
| `getFriendIds` — OR query | Returns array of IDs for accepted friendships in both directions |

**Mock setup:**
```typescript
const prismaMock = {
  friendship: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: { findUnique: jest.fn() },
};
const presenceMock = { getOnlineStatus: jest.fn() };
```

---

### PresenceService (`presence.service.spec.ts`)

| Test Case | Description |
|---|---|
| `setOnline` | Calls `redis.set` with key `user:{id}:online`, value `"1"`, EX 35 |
| `setOffline` | Calls `redis.del` with key `user:{id}:online` |
| `isOnline` — key exists | Returns `true` |
| `isOnline` — key missing | Returns `false` |
| `getOnlineStatus` — mixed | Returns array of booleans matching which keys exist; handles null for missing keys |
| `getOnlineStatus` — empty array | Returns empty array without calling Redis |

**Mock setup:**
```typescript
const redisMock = {
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn(),
};
```

---

### ActivityFeedService (`activity-feed.service.spec.ts`)

| Test Case | Description |
|---|---|
| `publish` — happy path | Calls `activityFeedModel.create` with the entry; fire-and-forget (does not throw) |
| `publish` — MongoDB error | Logs error but does not re-throw (caller is not disrupted) |
| `getFeed` — no friends | Returns `{ entries: [], nextCursor: null, hasMore: false }` without querying MongoDB |
| `getFeed` — first page, full | Returns `limit` entries; `hasMore: true`; correct `nextCursor` |
| `getFeed` — first page, partial | Returns fewer than `limit` entries; `hasMore: false`; `nextCursor: null` |
| `getFeed` — with cursor | Passes `_id: { $lt: ObjectId(cursor) }` to Mongoose query |
| `getFeed` — limit capped at 50 | Enforces max limit; passes at most 51 to Mongoose (limit + 1) |

**Mock setup:**
```typescript
const activityFeedModelMock = {
  create: jest.fn(),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  }),
};
const friendshipServiceMock = { getFriendIds: jest.fn() };
```

---

## Tier 2 — Integration Tests

Integration tests run against real databases spun up by Testcontainers. They verify the full service layer including database interactions.

### Setup

Use `@testcontainers/postgresql` and `@testcontainers/mongodb`. Redis uses `@testcontainers/redis` or `ioredis-mock` for simpler setup.

```typescript
// jest.integration.config.ts
export default {
  testMatch: ['**/*.integration.spec.ts'],
  testTimeout: 60000, // Testcontainer startup
};
```

### FriendshipService Integration (`friendships.service.integration.spec.ts`)

| Test Case | Description |
|---|---|
| Full friendship lifecycle | sendRequest → acceptRequest → getFriends (with presence) → unfriend → getFriends (empty) |
| Unique constraint | Sending duplicate request returns 409 without crashing |
| Block prevents re-request | Block user → attempt new request → 403 |
| getFriends with Redis presence | Start Redis container; set one friend online; verify `isOnline: true` in response |
| Bidirectional query | Friend A adds B; verify B's `getFriends` returns A |

### ActivityFeedService Integration (`activity-feed.service.integration.spec.ts`)

| Test Case | Description |
|---|---|
| publish and getFeed | Insert 3 entries for friend; getFeed returns them newest first |
| Cursor pagination | Insert 25 entries; first page returns 20 with `hasMore: true`; second page returns remaining 5 |
| Feed filtered to friends only | Insert entries for non-friend; getFeed excludes them |
| TTL index exists | Verify MongoDB collection has TTL index on `createdAt` |

---

## Tier 3 — End-to-End Tests (Playwright)

E2E tests run against the full application stack (NestJS + React dev server + real databases).

### Test: Friend Request Flow (`social.friend-request.spec.ts`)

```
1. User A logs in → navigates to /friends
2. User A searches for User B by username
3. User A clicks "Add Friend"
4. Assert: "Request Sent" appears; POST /friends/request returns 201
5. User B logs in → navigates to /friends
6. Assert: pending requests badge shows "1"
7. User B clicks "Accept" on User A's request
8. Assert: User A appears in User B's friends list
9. User A refreshes /friends
10. Assert: User B appears in User A's friends list
```

### Test: Online Presence Indicators (`social.presence.spec.ts`)

```
1. User A and User B are accepted friends
2. User A opens /friends in Browser A
3. User B opens any page in Browser B (connects to /presence)
4. Assert: User B shows green online indicator in User A's friends list within 5 seconds
5. User B closes the tab (graceful disconnect)
6. Assert: User B shows offline indicator in User A's friends list within 5 seconds
```

### Test: Activity Feed (`social.activity-feed.spec.ts`)

```
1. User A and User B are accepted friends
2. User B completes a game (via API call or seeded data)
3. User A opens /feed
4. Assert: User B's game activity appears at the top of the feed
5. Assert: FeedItem displays correct opponent name, rating change, and timestamp
6. Scroll to bottom → Assert: "Load More" button triggers next page load
```

---

## Test Data Factories

Located at `test/factories/social.factory.ts`:

```typescript
export const friendshipFactory = {
  pending: (overrides = {}) => ({
    id: `fr_${randomCuid()}`,
    requesterId: `user_${randomCuid()}`,
    addresseeId: `user_${randomCuid()}`,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
  accepted: (overrides = {}) => ({
    ...friendshipFactory.pending(overrides),
    status: 'ACCEPTED',
  }),
  blocked: (overrides = {}) => ({
    ...friendshipFactory.pending(overrides),
    status: 'BLOCKED',
  }),
};

export const activityEntryFactory = {
  gameWon: (actorId: string, overrides = {}) => ({
    actorId,
    actorUsername: 'test_player',
    type: 'GAME_WON',
    targetId: `game_${randomCuid()}`,
    targetName: 'opponent_player',
    metadata: { result: 'WIN', timeControl: '5+0', ratingChange: 12, opponent: 'opponent_player' },
    createdAt: new Date(),
    ...overrides,
  }),
  puzzleSolved: (actorId: string, overrides = {}) => ({
    actorId,
    actorUsername: 'test_player',
    type: 'PUZZLE_SOLVED',
    targetId: `puzzle_${randomCuid()}`,
    targetName: 'Mate in 2',
    metadata: { difficulty: 'MEDIUM', timeMs: 4200 },
    createdAt: new Date(),
    ...overrides,
  }),
};
```

---

## Coverage Targets

| Layer | Target |
|---|---|
| Unit tests | 90% line coverage on all service files |
| Integration tests | All happy paths + critical error paths covered |
| E2E tests | All three user-facing flows (friend request, presence, feed) covered |

---

## CI Integration

Tests are organized into three Jest projects (`jest.config.ts`):

```typescript
projects: [
  { displayName: 'unit', testMatch: ['**/*.spec.ts'], /* excludes integration */ },
  { displayName: 'integration', testMatch: ['**/*.integration.spec.ts'] },
]
```

Unit tests run on every push. Integration tests run on pull requests to `main`. E2E tests (Playwright) run nightly and on release branches.
