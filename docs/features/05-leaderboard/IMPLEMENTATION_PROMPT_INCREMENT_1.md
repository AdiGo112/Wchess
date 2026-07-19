# Implementation Prompt — Leaderboard Increment 1: Backend Redis Core

Copy and paste this prompt into a new conversation to implement this increment.

---

You are implementing the leaderboard backend for a NestJS chess web app called ChessWeb.

## Stack
- NestJS with TypeScript
- PostgreSQL + Prisma (users, ratings, games)
- Redis via `ioredis` (already set up via a shared `RedisModule` with token `REDIS_CLIENT`)
- The `LeaderboardModule` already exists with a basic `leaderboard.service.ts` and `leaderboard.controller.ts`

## What already exists
`backend/src/leaderboard/leaderboard.service.ts` has a `seedFromDatabase()` method that reads all `UserRating` rows and does `ZADD`. It works but the method is not called anywhere and the sorted set key format is `leaderboard:{variant}` where variant is `'bullet'|'blitz'|'rapid'|'classical'`.

`backend/src/utils/elo.ts` exports `updateGlicko2(winnerId, loserId, variant, prisma)` which updates `UserRating` in PostgreSQL. It returns `{ winnerNewRating, loserNewRating }`.

`backend/src/game/game.service.ts` calls `updateGlicko2()` inside `handleGameEnd(roomId, result)`. After the Glicko-2 call, it does NOT currently update Redis.

## Your task

### 1. Update `LeaderboardService`

Add these methods to `backend/src/leaderboard/leaderboard.service.ts`:

```typescript
async updateRating(userId: string, variant: string, newRating: number): Promise<void>
// ZADD leaderboard:{variant} newRating userId

async getTopPlayers(variant: string): Promise<LeaderboardEntry[]>
// ZREVRANGE leaderboard:{variant} 0 99 WITHSCORES
// Then fetch usernames + avatarUrl from PostgreSQL with WHERE id IN (userIds)
// Return array of { rank, userId, username, avatarUrl, rating }

async getUserRank(userId: string, variant: string): Promise<{ rank: number; rating: number } | null>
// ZREVRANK + ZSCORE. Rank is 1-indexed (add 1 to ZREVRANK result).
// Return null if user has no entry in the set.

async seedFromDatabase(): Promise<void>
// Already exists — keep it, just make sure it's called on module init
// via implements OnModuleInit { onModuleInit() { this.seedFromDatabase() } }
// Only seed if set is empty: ZCARD leaderboard:blitz === 0
```

`LeaderboardEntry` interface:
```typescript
interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  rd: number;
}
```

Include `rd` in the response — fetch it from `UserRating` table during the PostgreSQL enrichment query.

### 2. Update `LeaderboardController`

`backend/src/leaderboard/leaderboard.controller.ts`:

```
GET /leaderboard/:variant       → getTopPlayers(variant)  — public
GET /leaderboard/:variant/rank  → getUserRank(userId, variant)  — JwtAuthGuard
```

Validate `variant` with a pipe: must be one of `bullet|blitz|rapid|classical`, throw `BadRequestException` otherwise.

### 3. Update `GameService`

In `backend/src/game/game.service.ts`, inside `handleGameEnd()`, after `updateGlicko2()` returns `{ winnerNewRating, loserNewRating }`, add:

```typescript
await Promise.all([
  this.leaderboardService.updateRating(winnerId, variant, winnerNewRating),
  this.leaderboardService.updateRating(loserId, variant, loserNewRating),
]);
```

Inject `LeaderboardService` into `GameService` via the constructor. Make sure `LeaderboardModule` exports `LeaderboardService` and `GameModule` imports `LeaderboardModule`.

### 4. Variant derivation

The `variant` string comes from the game's `timeControl` field (e.g. `'blitz-5+3'`). The util `variantFromTimeControl(timeControl: string): string` already exists in `backend/src/utils/elo.ts` — use it.

## Response format for `GET /leaderboard/:variant`
```json
[
  { "rank": 1, "userId": "abc", "username": "Magnus", "avatarUrl": null, "rating": 2800, "rd": 45 },
  { "rank": 2, ... }
]
```

## Error handling
- Unknown variant → `400 Bad Request: { error: 'Invalid variant. Must be bullet|blitz|rapid|classical' }`
- `getUserRank` for user not on leaderboard → `404 Not Found: { error: 'User has no rating for this variant' }`

## Verify your implementation
1. Start two games, finish them → check Redis: `ZREVRANGE leaderboard:blitz 0 9 WITHSCORES`
2. `GET /leaderboard/blitz` → JSON array of up to 100 players
3. `GET /leaderboard/blitz/rank` (with JWT) → `{ rank: 3, rating: 1523 }`
4. `GET /leaderboard/invalid` → 400
5. Restart the server → sorted sets are NOT re-seeded if they already have data (check ZCARD first)
