# Feature 05 — Leaderboard: Workflows

## Workflow 1: Rating Update on Game End

Triggered by: game result finalized in `GameService.persistGame()`

```
1. GameService calculates new Glicko-2 ratings for both players
2. GameService calls prisma.user.update({ rating: newRating }) for each player
3. GameService calls LeaderboardService.updateRating(userId, newRating, variant) for each player

LeaderboardService.updateRating(userId: string, newRating: number, variant: ChessVariant):
    a. Determine week key:  `${year}-W${isoWeekNumber}`
    b. Determine month key: `${year}-${month.padStart(2, '0')}`
    c. ZADD leaderboard:{variant}                               newRating userId
    d. ZADD leaderboard:{variant}:weekly:{weekKey}              newRating userId
    e. ZADD leaderboard:{variant}:monthly:{monthKey}            newRating userId
    f. Set TTL on weekly key:  EXPIRE leaderboard:{variant}:weekly:{weekKey}  691200   (8 days)
    g. Set TTL on monthly key: EXPIRE leaderboard:{variant}:monthly:{monthKey} 2764800 (32 days)
    h. Invalidate cache:
       DEL leaderboard:cache:{variant}:weekly:{weekKey}
       DEL leaderboard:cache:{variant}:monthly:{monthKey}
       (All-time board has no response cache to invalidate)
```

Notes:
- Step f and g use EXPIRE only if the key was just created. Use `EXPIRE key seconds NX` in Redis 7+ to avoid resetting TTL on existing keys that are mid-period.
- Step h invalidates the 60s response cache so the next request reflects the new rating immediately.

---

## Workflow 2: View All-Time Leaderboard

Triggered by: `GET /leaderboard?variant=blitz&limit=100`

```
1. LeaderboardController receives request, validates query params via LeaderboardQueryDto
2. Calls LeaderboardService.getTop100(variant, limit)

LeaderboardService.getTop100(variant, limit):
    a. ZREVRANGE leaderboard:{variant} 0 (limit-1) WITHSCORES
       → returns flat array: [userId1, score1, userId2, score2, ...]
    b. Parse into RedisRankEntry[]: [{ userId, score }, ...]
    c. Extract userIds array
    d. prisma.user.findMany({ where: { id: { in: userIds } }, select: enrichment fields })
    e. Build lookup map: Map<userId, UserEnrichment>
    f. Map each Redis entry to LeaderboardEntry:
       {
         rank:        index + 1,
         userId:      entry.userId,
         username:    userMap.get(userId).username,
         rating:      Math.round(entry.score),
         gamesPlayed: userMap.get(userId)[`${variant}GamesPlayed`],
         winRate:     userMap.get(userId)[`${variant}Wins`] / gamesPlayed || 0,
       }
    g. Return { variant, period: 'all-time', total: ZCARD result, entries }
```

---

## Workflow 3: View Time-Scoped Leaderboard (Weekly / Monthly)

Triggered by: `GET /leaderboard/weekly?variant=rapid` or `GET /leaderboard/monthly?variant=blitz`

```
LeaderboardService.getTimeScoped(variant, period: 'weekly' | 'monthly', limit):
    a. Compute current period key:
       - weekly:  `${year}-W${isoWeekNumber}`
       - monthly: `${year}-${month}`
    b. Build Redis key: leaderboard:{variant}:{period}:{periodKey}
    c. Build cache key: leaderboard:cache:{variant}:{period}:{periodKey}

    d. Redis GET cacheKey
       → cache HIT: return JSON.parse(cachedValue) immediately

    e. cache MISS:
       ZREVRANGE redisKey 0 (limit-1) WITHSCORES
       → Parse, enrich from PostgreSQL (same as Workflow 2 steps b-f)
       → Build response object
       → SET cacheKey JSON.stringify(response) EX 60
       → Return response
```

---

## Workflow 4: User's Own Rank Lookup

Triggered by: `GET /leaderboard/me?variant=blitz`

```
LeaderboardService.getUserRank(userId, variant):
    a. ZREVRANK leaderboard:{variant} userId
       → Returns integer (0-indexed) if user is in set
       → Returns nil if user has no rated games in this variant

    b. If nil:
       → Fetch user from PostgreSQL for username
       → Return { rank: null, userId, username, rating: null, gamesPlayed: 0, winRate: 0 }

    c. If integer N:
       → rank = N + 1   (convert 0-indexed to 1-indexed)
       → ZSCORE leaderboard:{variant} userId  → rating
       → Fetch user enrichment from PostgreSQL
       → Return { rank, userId, username, rating, gamesPlayed, winRate }
```

---

## Workflow 5: New Player First Rated Game

This is a special sub-case of Workflow 1 for a user who has never played a rated game.

```
1. Player finishes first rated game
2. GameService assigns initial Glicko-2 rating (mu=1200, RD=350, volatility=0.06)
3. LeaderboardService.updateRating(userId, 1200, 'blitz') called
4. ZADD adds the user to the sorted set for the first time
5. On next /leaderboard/me call, ZREVRANK returns their position (could be rank 1 or low rank depending on how many players have played)
6. User is now visible on the leaderboard
```
