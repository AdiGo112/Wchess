# Feature 05 — Leaderboard: Domain Model

## Overview

The leaderboard has no dedicated Prisma model. All ranking data derives from two existing sources:

1. **Redis sorted sets** — rank ordering and current rating (the score)
2. **PostgreSQL User table** — username, gamesPlayed, wins (for winRate calculation)

This avoids duplication: User.rating is the single source of truth; the Redis sorted set is a derived index that enables O(log N) rank operations.

## TypeScript Interfaces

```typescript
// The canonical leaderboard entry returned to clients
export interface LeaderboardEntry {
  rank: number;          // 1-indexed rank (ZREVRANK + 1)
  userId: string;        // UUID matching User.id
  username: string;      // Denormalized from PostgreSQL for display
  rating: number;        // Current Glicko-2 rating (mu value, displayed as integer)
  gamesPlayed: number;   // Total rated games in this variant
  winRate: number;       // wins / gamesPlayed, range [0, 1]
}

// Response for /me endpoint (rank may be null)
export interface UserRankResult {
  rank: number | null;   // null if userId not in the sorted set
  userId: string;
  username: string;
  rating: number | null;
  gamesPlayed: number;
  winRate: number;
}

// Internal Redis result before enrichment
export interface RedisRankEntry {
  userId: string;        // member in the sorted set
  score: number;         // rating value stored as the sorted set score
}
```

## Redis Sorted Set Format

Each leaderboard variant maintains up to three sorted sets:

```
Key:    leaderboard:blitz
Member: "550e8400-e29b-41d4-a716-446655440000"   (userId)
Score:  1740                                      (current rating as float)
```

Operations:
- `ZADD leaderboard:blitz 1740 {userId}` — upsert on game end (overwrites previous score)
- `ZREVRANGE leaderboard:blitz 0 99 WITHSCORES` — top 100 with scores (rank = index + 1)
- `ZREVRANK leaderboard:blitz {userId}` — 0-indexed rank of a user; nil if not present
- `ZCARD leaderboard:blitz` — total players on the board

## Business Rules

1. **Rated games only.** Only games with `isRated: true` update the leaderboard. Casual games are ignored.

2. **All-time board = current rating.** The all-time sorted set always holds the user's most recent rating. It is not a historical peak. A player who loses games will drop in rank.

3. **Weekly/monthly boards = rating at time of last game within the period.** The weekly/monthly sorted sets receive a ZADD on every game end. The score is the user's rating immediately after that game. If a user plays multiple games in a week, only the final score matters (ZADD overwrites).

4. **Weekly/monthly keys are time-scoped by ISO week / calendar month.** Key example: `leaderboard:blitz:weekly:2026-W26`. Key example: `leaderboard:blitz:monthly:2026-06`. New keys are created automatically as time progresses; old keys expire via TTL.

5. **User's own rank is always visible.** The `/me` endpoint uses ZREVRANK, which returns a rank regardless of whether the user is in the top 100. If ZREVRANK returns nil (user has no rated games), the response returns `{ rank: null }`.

6. **Enrichment is always from PostgreSQL.** Username, gamesPlayed, and winRate are never stored in Redis. They are batch-fetched from PostgreSQL on each leaderboard read using a single `IN` query against User IDs.

7. **ZADD uses NX flag for new players, XX flag would overwrite — we always want overwrite.** Use plain `ZADD` (not NX/XX) so score is always updated to the latest rating.

## PostgreSQL Enrichment Query

```typescript
// Batch fetch to enrich Redis results
const users = await prisma.user.findMany({
  where: { id: { in: userIds } },
  select: {
    id: true,
    username: true,
    blitzGamesPlayed: true,   // or rapidGamesPlayed etc. based on variant
    blitzWins: true,
  },
});
```

The User model needs per-variant counters. If not already present, add:
```prisma
model User {
  // existing fields...
  bulletGamesPlayed  Int @default(0)
  bulletWins         Int @default(0)
  blitzGamesPlayed   Int @default(0)
  blitzWins          Int @default(0)
  rapidGamesPlayed   Int @default(0)
  rapidWins          Int @default(0)
  classicalGamesPlayed Int @default(0)
  classicalWins        Int @default(0)
}
```

## Glicko-2 Rating Values

The score stored in Redis is the Glicko-2 mu (mean rating) converted to a human-readable scale:

- Starting rating: 1200
- Typical active player range: 800–2800
- Rating Deviation (RD) is stored on the User model, not in Redis
- Volatility is stored on the User model, not in Redis
- Only the final converted rating is the Redis score
