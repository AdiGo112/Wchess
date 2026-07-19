# Feature 05 — Leaderboard: Architecture

## Service Map

```
GameService (02-game-engine)
    │
    │  on game end: calls
    ▼
LeaderboardService
    │
    ├─► Redis ZADD  ──► leaderboard:{variant}           (all-time sorted set)
    │                   leaderboard:{variant}:weekly:{year}-{weekNumber}
    │                   leaderboard:{variant}:monthly:{year}-{month}
    │
    └─► PostgreSQL  ──► User table (username, gamesPlayed, winRate enrichment)

LeaderboardController
    │
    ├─ GET /leaderboard?variant=blitz
    │       └─ ZREVRANGE leaderboard:blitz 0 99 WITHSCORES
    │              └─ batch enrich from PostgreSQL
    │
    ├─ GET /leaderboard/weekly?variant=blitz
    │       └─ Redis GET cache key (60s TTL)
    │              └─ cache miss → ZREVRANGE weekly key → enrich → SET cache
    │
    ├─ GET /leaderboard/monthly?variant=blitz
    │       └─ same pattern as weekly
    │
    └─ GET /leaderboard/me?variant=blitz
            └─ ZREVRANK → returns 0-indexed rank → +1 → also fetch user stats
```

## Redis Key Schema

| Key Pattern | Type | TTL | Description |
|-------------|------|-----|-------------|
| `leaderboard:{variant}` | Sorted Set | none | All-time leaderboard. Member: userId, Score: rating |
| `leaderboard:{variant}:weekly:{year}-{week}` | Sorted Set | 8 days | Weekly board. Week resets Monday 00:00 UTC |
| `leaderboard:{variant}:monthly:{year}-{month}` | Sorted Set | 32 days | Monthly board. Month resets 1st 00:00 UTC |
| `leaderboard:cache:{variant}:weekly:{year}-{week}` | String (JSON) | 60s | Cached response for weekly endpoint |
| `leaderboard:cache:{variant}:monthly:{year}-{month}` | String (JSON) | 60s | Cached response for monthly endpoint |

Variants: `bullet` | `blitz` | `rapid` | `classical`

## Backend File Tree

```
backend/src/leaderboard/
├── leaderboard.module.ts          # NestJS module, imports Redis, PrismaModule
├── leaderboard.controller.ts      # REST endpoints with JwtAuthGuard
├── leaderboard.service.ts         # Core logic: ZADD, ZREVRANGE, ZREVRANK, cache
└── dto/
    ├── leaderboard-query.dto.ts   # variant, limit query params with validation
    └── leaderboard-entry.dto.ts   # Response shape DTO
```

## Data Flow on Game End

```
GameService.persistGame(gameResult)
    │
    ├─ calculate new ratings via Glicko-2
    │
    ├─ prisma.user.update({ rating: newRating })          (PostgreSQL)
    │
    └─ leaderboardService.updateRating(userId, newRating, variant)
            │
            ├─ ZADD leaderboard:{variant} newRating userId
            ├─ ZADD leaderboard:{variant}:weekly:{year}-{week} newRating userId
            └─ ZADD leaderboard:{variant}:monthly:{year}-{month} newRating userId
```

## Data Flow on Leaderboard Read (All-Time)

```
GET /leaderboard?variant=blitz&limit=100
    │
    ├─ ZREVRANGE leaderboard:blitz 0 99 WITHSCORES
    │     returns: [userId1, score1, userId2, score2, ...]
    │
    ├─ prisma.user.findMany({ where: { id: { in: userIds } } })
    │     returns: [{ id, username, gamesPlayed, wins }]
    │
    └─ merge: { rank, userId, username, rating, gamesPlayed, winRate }
              return array
```

## Cache Strategy (Time-Scoped Boards)

Time-scoped boards are updated less frequently (one ZADD per game end) but queried often. A 60-second cache-aside pattern is applied:

1. Check Redis cache key for the time period
2. Cache hit → return parsed JSON immediately
3. Cache miss → execute ZREVRANGE + PostgreSQL enrichment → SET cache with 60s EX → return result

All-time board does NOT use response-level cache; it reads directly from the sorted set on each request (the ZREVRANGE is O(log N + M) which is fast enough).

## Module Dependencies

```
LeaderboardModule
  imports:
    - PrismaModule    (PostgreSQL enrichment)
    - RedisModule     (ioredis for sorted sets)
  exports:
    - LeaderboardService   (consumed by GameModule)
```
