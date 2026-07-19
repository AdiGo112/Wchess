# Feature 05 — Leaderboard: Automated Testing Strategy

## Test Layers

### 1. Unit Tests — LeaderboardService

Mock ioredis using `jest.mock()` or `ioredis-mock`. No real Redis connection required.

**Test cases:**

| Test | What to assert |
|------|---------------|
| `updateRating` calls ZADD on all-time key | `redis.zadd('leaderboard:blitz', 1750, userId)` called |
| `updateRating` calls ZADD on weekly key | Key matches `leaderboard:blitz:weekly:${year}-W${week}` |
| `updateRating` calls ZADD on monthly key | Key matches `leaderboard:blitz:monthly:${year}-06` |
| `updateRating` sets TTL on weekly key (8 days) | `redis.expire(weeklyKey, 691200)` called |
| `updateRating` sets TTL on monthly key (32 days) | `redis.expire(monthlyKey, 2764800)` called |
| `updateRating` invalidates weekly cache | `redis.del(cacheKey)` called after ZADD |
| `getTop100` returns entries ordered by rank | rank=1 has highest rating |
| `getTop100` enriches from PostgreSQL | `prisma.user.findMany` called with correct userIds |
| `getTop100` handles empty leaderboard | Returns `{ entries: [], total: 0 }` |
| `getTimeScoped` returns cached result on cache hit | `prisma.user.findMany` NOT called |
| `getTimeScoped` populates cache on miss | `redis.set` called with 60s TTL |
| `getUserRank` returns correct 1-indexed rank | ZREVRANK returns 4 → response rank is 5 |
| `getUserRank` returns null rank when user not in set | ZREVRANK returns nil → `{ rank: null }` |
| `getUserRank` returns rank for user outside top 100 | ZREVRANK returns 347 → `{ rank: 348 }` |

### 2. Integration Tests — Backend

Requires: real Redis (testcontainers or local), real PostgreSQL with seeded users.

**Test scenarios:**

| Scenario | Steps | Assert |
|---------|-------|--------|
| Game end updates leaderboard | Seed 2 users, call `updateRating`, call `getTop100` | Returns both users in correct order |
| Rating drop changes rank | User A: 1800, User B: 1900. Update A to 1950. | User A rank 1, User B rank 2 |
| Weekly board resets | Seed weekly key with old week number. New game updates new week key. | Old key still has old data; new key has new entry |
| GET /leaderboard returns 200 | Seed Redis, call endpoint | Status 200, correct JSON shape |
| GET /leaderboard/me for ranked user | Seed user at rank 5 | Returns `{ rank: 5 }` |
| GET /leaderboard/me for unranked user | No ZADD for user | Returns `{ rank: null }` |
| Invalid variant returns 400 | GET /leaderboard?variant=chess960 | Status 400, body `{ code: 'INVALID_VARIANT' }` |

### 3. Frontend Tests — LeaderboardPage

Use React Testing Library + MSW (Mock Service Worker) to intercept API calls.

**Test cases:**

| Test | What to assert |
|------|---------------|
| Default tab is Blitz | "Blitz" tab has active style on first render |
| Clicking Rapid tab calls `/leaderboard?variant=rapid` | MSW intercept verifies request |
| Table renders correct number of rows | 10 seeded entries → 10 `<tr>` elements in table |
| Own rank row has yellow highlight | Row with user's ID has `bg-yellow-100` class |
| Own rank shown outside top 100 | Divider "..." row + user row at the bottom |
| Unranked user shows "Unranked" badge | No entry in mock → "You are not yet ranked" text |
| Loading skeleton appears before data | Query is delayed → skeleton rows visible |
| Period selector switches between boards | Click "Weekly" → calls `/leaderboard/weekly` |
| Win rate shows as percentage | winRate=0.65 → displays "65%" |

## Test Utilities

```typescript
// test/helpers/leaderboard.factory.ts
export function makeLeaderboardEntry(overrides?: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    rank: 1,
    userId: 'user-uuid-' + Math.random().toString(36).slice(2),
    username: 'TestPlayer',
    rating: 1500,
    gamesPlayed: 20,
    winRate: 0.55,
    ...overrides,
  };
}

export function makeLeaderboardResponse(count = 10): LeaderboardResponse {
  return {
    variant: 'blitz',
    period: 'all-time',
    total: count,
    entries: Array.from({ length: count }, (_, i) =>
      makeLeaderboardEntry({ rank: i + 1, rating: 2000 - i * 50 })
    ),
  };
}
```

## Coverage Targets

| Layer | Target |
|-------|--------|
| LeaderboardService (unit) | 100% of public methods |
| LeaderboardController (unit) | 100% of route handlers |
| Integration (backend) | Happy path + unranked user + invalid variant |
| Frontend (RTL) | All interactive elements + loading + error states |
