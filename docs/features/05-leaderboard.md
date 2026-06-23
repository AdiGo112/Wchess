# Feature 05 — Leaderboard

**Branch:** `feature/leaderboard`
**Depends on:** `feature/game-engine` (ratings must exist)

## Goal
Live-updating leaderboards per variant (Bullet, Blitz, Rapid, Classical) using Redis sorted sets. Weekly and monthly time-scoped boards.

---

## Backend

### Files
```
backend/src/leaderboard/
├── leaderboard.module.ts
├── leaderboard.service.ts
└── leaderboard.controller.ts
```

### Redis Sorted Sets
```
ZADD leaderboard:blitz {rating} {userId}    — on every game end
ZADD leaderboard:bullet ...
ZADD leaderboard:rapid ...
ZADD leaderboard:classical ...

ZREVRANGE leaderboard:blitz 0 99 WITHSCORES  — top 100
ZREVRANK  leaderboard:blitz {userId}          — user's rank (0-indexed)
ZSCORE    leaderboard:blitz {userId}          — user's score
```

### Time-scoped boards
- `leaderboard:week:blitz` — snapshot copied every Sunday midnight
- `leaderboard:month:blitz` — snapshot copied first of each month
- Historical monthly snapshots saved to PostgreSQL

### Enrichment
Top-100 leaderboard entries contain only `userId` + `score`. The controller:
1. Fetches top 100 from Redis
2. Batch-fetches usernames + avatars from PostgreSQL (or Redis cache)
3. Returns enriched list

Cached in Redis for 60 seconds (`cache:leaderboard:{variant}:{period}`).

### Endpoints
```
GET /api/v1/leaderboard?variant=blitz&period=all   → LeaderboardEntryDto[100]
GET /api/v1/leaderboard?variant=blitz&period=week
GET /api/v1/leaderboard?variant=blitz&period=month
GET /api/v1/leaderboard/rank/:userId               → { rank, rating, variant }
```

---

## Frontend

### Page
```
frontend/src/pages/Leaderboard.tsx
```

### Layout
```
┌─────────────────────────────────────────────────┐
│  Leaderboard                                     │
│  [Bullet] [Blitz] [Rapid] [Classical]  ← tabs   │
│  [All Time] [This Week] [This Month]   ← period  │
│                                                  │
│  # │ Player          │ Rating │ W   │ L   │ D   │
│  1 │ 🏆 alice       │ 2450   │ 312 │  45 │  23 │
│  2 │    bob         │ 2380   │ 280 │  60 │  31 │
│ ...                                              │
│  [Your rank: #142 — Rating: 1420]               │
└─────────────────────────────────────────────────┘
```

---

## Checklist
- [ ] `ZADD leaderboard:{variant}` on game end (in GamesService)
- [ ] LeaderboardService: `getTopN()` — ZREVRANGE + enrich
- [ ] LeaderboardService: `getUserRank()` — ZREVRANK
- [ ] LeaderboardController: endpoints
- [ ] 60-second Redis cache for enriched results
- [ ] Cron job: weekly/monthly snapshots
- [ ] Frontend: Leaderboard page with variant + period tabs
- [ ] Frontend: Show logged-in user's rank at bottom

## Verify
1. Play rated game → both players' ELO updates in Redis leaderboard
2. `GET /leaderboard?variant=blitz` → sorted list with enriched usernames
3. `GET /leaderboard/rank/:userId` → correct rank
4. Switch variant tab → different rankings
5. 60s cache: second request within 60s doesn't hit PostgreSQL
