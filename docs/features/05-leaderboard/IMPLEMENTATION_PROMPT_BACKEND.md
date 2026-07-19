# Feature 05 — Leaderboard: Backend Implementation Prompt

Copy and paste the following prompt into Claude Code to implement the full backend.

---

## Prompt

```
Implement the leaderboard backend for ChessWeb (NestJS + Redis + PostgreSQL/Prisma).

## Context

- Backend is NestJS located at backend/src/
- Redis is already wired up via a shared RedisModule exposing an ioredis client
- Prisma is already wired up via PrismaModule/PrismaService
- GameService is at backend/src/game/game.service.ts and has a persistGame() method
- Auth guard is JwtAuthGuard, and JWT payload contains { userId, username }
- Chess variants: 'bullet' | 'blitz' | 'rapid' | 'classical'

## Files to Create

### backend/src/leaderboard/dto/leaderboard-query.dto.ts

Use class-validator. Export:
- ChessVariant enum with bullet, blitz, rapid, classical
- LeaderboardQueryDto with optional variant (default blitz) and optional limit (default 100, min 1 max 100)

### backend/src/leaderboard/leaderboard.service.ts

Injectable NestJS service. Inject @InjectRedis() and PrismaService.

Methods:

1. async updateRating(userId: string, newRating: number, variant: ChessVariant): Promise<void>
   - Compute ISO week key: use date-fns getISOWeek() and getYear()
   - Compute month key: padded month string e.g. '2026-06'
   - const allTimeKey = `leaderboard:${variant}`
   - const weeklyKey = `leaderboard:${variant}:weekly:${year}-W${weekNum}`
   - const monthlyKey = `leaderboard:${variant}:monthly:${monthKey}`
   - ZADD all three keys with newRating as score, userId as member
   - EXPIRE weeklyKey 691200 with NX flag (Redis 7 supports EXPIRE key seconds NX)
   - EXPIRE monthlyKey 2764800 with NX flag
   - DEL the weekly cache key: `leaderboard:cache:${variant}:weekly:${year}-W${weekNum}`
   - DEL the monthly cache key: `leaderboard:cache:${variant}:monthly:${monthKey}`

2. async getTop100(variant: ChessVariant, limit = 100): Promise<LeaderboardResponse>
   - ZREVRANGE `leaderboard:${variant}` 0 (limit-1) WITHSCORES
   - Parse flat array into [{ userId, score }]
   - If empty: return { variant, period: 'all-time', total: 0, entries: [] }
   - ZCARD `leaderboard:${variant}` for total count
   - Batch enrich: prisma.user.findMany({ where: { id: { in: userIds } }, select: { id, username, blitzGamesPlayed (etc), blitzWins (etc) } })
   - Build and return entries array with rank (1-indexed), username, rating (Math.round(score)), gamesPlayed, winRate

3. async getTimeScoped(variant: ChessVariant, period: 'weekly' | 'monthly', limit = 100): Promise<LeaderboardResponse>
   - Compute current period key and Redis keys (same as updateRating)
   - Check Redis cache: const cached = await redis.get(cacheKey)
   - If cached: return JSON.parse(cached)
   - Cache miss: ZREVRANGE + ZCARD + enrich (same as getTop100 but on time-scoped key)
   - SET cacheKey JSON.stringify(response) EX 60
   - Return response

4. async getUserRank(userId: string, variant: ChessVariant): Promise<UserRankResult>
   - ZREVRANK `leaderboard:${variant}` userId → rawRank
   - If rawRank === null: fetch username from prisma, return { rank: null, userId, username, rating: null, gamesPlayed: 0, winRate: 0 }
   - Else: ZSCORE to get rating, fetch user enrichment, return { rank: rawRank + 1, userId, username, rating, gamesPlayed, winRate }

### backend/src/leaderboard/leaderboard.controller.ts

@Controller('leaderboard') with @UseGuards(JwtAuthGuard) on the /me route only (other routes JWT optional — do not require auth for public leaderboard).

Routes:
- @Get() with @Query() LeaderboardQueryDto → calls service.getTop100(variant, limit)
- @Get('weekly') with @Query() LeaderboardQueryDto → calls service.getTimeScoped(variant, 'weekly', limit)
- @Get('monthly') with @Query() LeaderboardQueryDto → calls service.getTimeScoped(variant, 'monthly', limit)
- @Get('me') @UseGuards(JwtAuthGuard) → extracts userId from @CurrentUser(), calls service.getUserRank(userId, variant)

### backend/src/leaderboard/leaderboard.module.ts

@Module importing PrismaModule, RedisModule. Provides LeaderboardController, LeaderboardService. Exports LeaderboardService.

## Modify GameService

In backend/src/game/game.service.ts, inject LeaderboardService. After rating calculation in persistGame():

```typescript
// After prisma.user.update for each player:
await this.leaderboardService.updateRating(whitePlayer.id, newWhiteRating, game.variant);
await this.leaderboardService.updateRating(blackPlayer.id, newBlackRating, game.variant);
```

Import LeaderboardModule into GameModule.

## Verification

After implementing, test with these curl commands:

```bash
# Start a rated blitz game, play it to completion, then:
curl "http://localhost:3000/leaderboard?variant=blitz&limit=10"
# Expect: 200 with entries array

curl "http://localhost:3000/leaderboard/weekly?variant=blitz"
# Expect: 200 with weekly entries

curl "http://localhost:3000/leaderboard/monthly?variant=blitz"
# Expect: 200 with monthly entries

curl "http://localhost:3000/leaderboard/me?variant=blitz" \
  -H "Authorization: Bearer $YOUR_TOKEN"
# Expect: 200 with your rank

curl "http://localhost:3000/leaderboard?variant=chess960"
# Expect: 400 INVALID_VARIANT
```
```
