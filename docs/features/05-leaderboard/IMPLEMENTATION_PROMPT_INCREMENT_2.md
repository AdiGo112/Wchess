# Implementation Prompt — Leaderboard Increment 2: Time-Scoped Boards + Cache

Copy and paste this prompt into a new conversation to implement this increment.

---

You are adding weekly/monthly leaderboards and a 60-second response cache to the ChessWeb NestJS backend.

## What already exists (from Increment 1)
- `LeaderboardService` has `updateRating(userId, variant, rating)` which does `ZADD leaderboard:{variant} rating userId`
- `LeaderboardService` has `getTopPlayers(variant)` which reads `ZREVRANGE leaderboard:{variant} 0 99`
- `GameService.handleGameEnd()` calls `leaderboardService.updateRating()` for both players after Glicko-2

## Your task

### 1. Time-scoped sorted set keys

Add two helper methods to `LeaderboardService`:

```typescript
private getWeekKey(variant: string): string {
  // Returns e.g. "leaderboard:blitz:weekly:2026-W26"
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `leaderboard:${variant}:weekly:${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

private getMonthKey(variant: string): string {
  // Returns e.g. "leaderboard:blitz:monthly:2026-06"
  const now = new Date();
  return `leaderboard:${variant}:monthly:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
```

### 2. Update `updateRating()` to write all three sets

Modify the existing `updateRating(userId, variant, rating)` to do all three ZADDs atomically:

```typescript
const weekKey = this.getWeekKey(variant);
const monthKey = this.getMonthKey(variant);
const pipeline = this.redis.pipeline();
pipeline.zadd(`leaderboard:${variant}`, rating, userId);
pipeline.zadd(weekKey, rating, userId);
pipeline.zadd(monthKey, rating, userId);
// Set TTL only if keys are new (NX flag not available on EXPIRE, use EXISTS check or just always set)
pipeline.expire(weekKey, 8 * 24 * 60 * 60);   // 8 days
pipeline.expire(monthKey, 32 * 24 * 60 * 60);  // 32 days
await pipeline.exec();
```

### 3. Update `getTopPlayers()` to accept a `period` parameter

```typescript
async getTopPlayers(variant: string, period: 'all' | 'weekly' | 'monthly' = 'all'): Promise<LeaderboardEntry[]>
```

Select the Redis key based on `period`:
- `'all'` → `leaderboard:{variant}`
- `'weekly'` → `leaderboard:{variant}:weekly:{YYYY-WNN}`
- `'monthly'` → `leaderboard:{variant}:monthly:{YYYY-MM}`

### 4. Add a 60-second in-memory cache

Inside `LeaderboardService`, add a private cache map:

```typescript
private cache = new Map<string, { data: LeaderboardEntry[]; expiresAt: number }>();
```

In `getTopPlayers()`, before hitting Redis:
```typescript
const cacheKey = `${variant}:${period}`;
const cached = this.cache.get(cacheKey);
if (cached && cached.expiresAt > Date.now()) return cached.data;

// ... fetch from Redis + PostgreSQL ...

this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
return result;
```

### 5. Update the controller

`GET /leaderboard/:variant` now accepts `?period=all|weekly|monthly` query param:

```typescript
@Get(':variant')
getTopPlayers(
  @Param('variant') variant: string,
  @Query('period') period: 'all' | 'weekly' | 'monthly' = 'all',
) {
  return this.leaderboardService.getTopPlayers(variant, period);
}
```

Validate `period` — if not one of the three values, throw `BadRequestException`.

## Verify your implementation
1. Finish a game → check Redis: `KEYS leaderboard:blitz:*` should show the weekly and monthly keys with TTLs
2. `GET /leaderboard/blitz?period=weekly` → returns this week's top players
3. `GET /leaderboard/blitz?period=monthly` → returns this month's top players
4. `GET /leaderboard/blitz` twice within 60s → second call returns same data (add a log line in the service to confirm cache hit)
5. `TTL leaderboard:blitz:weekly:2026-W26` in Redis → should be ≤ 691200 (8 days in seconds)
6. `GET /leaderboard/blitz?period=invalid` → 400 Bad Request
