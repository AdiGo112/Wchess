# Leaderboard — Increment 2: Time-Scoped Boards + Cache

## Scope
Add weekly and monthly leaderboards using time-scoped Redis sorted sets. Add a 60-second response cache so the top-100 endpoint doesn't hit Redis on every request.

## What Gets Built
- Weekly sorted set key: `leaderboard:{variant}:weekly:{YYYY-WW}` (ISO week)
- Monthly sorted set key: `leaderboard:{variant}:monthly:{YYYY-MM}`
- On game end: `ZADD` to all three sets (global, weekly, monthly) for the variant
- Weekly/monthly sets expire automatically: weekly TTL = 8 days, monthly TTL = 32 days (Redis `EXPIRE`)
- `GET /leaderboard/:variant?period=all|weekly|monthly` — `period` query param selects which set to read
- 60-second in-memory cache on `getTopPlayers()` using a `Map<string, { data, expiresAt }>` inside `LeaderboardService`

## Files Created / Modified
| Action | File |
|---|---|
| Modify | `backend/src/leaderboard/leaderboard.service.ts` — add `getWeekKey()`, `getMonthKey()`, period-aware `getTopPlayers()`, simple TTL cache map |
| Modify | `backend/src/leaderboard/leaderboard.controller.ts` — add `?period` query param to `GET /:variant` |
| Modify | `backend/src/game/game.service.ts` — add `ZADD` calls for weekly and monthly sets alongside global |

## Acceptance Criteria
- [ ] `GET /leaderboard/rapid?period=weekly` returns only this week's top players
- [ ] `GET /leaderboard/rapid?period=monthly` returns only this month's top players
- [ ] Weekly key `leaderboard:rapid:weekly:2026-W26` has TTL ≤ 691200s (8 days) in Redis
- [ ] Two consecutive `GET /leaderboard/blitz` calls within 60s produce identical responses and the second does not query Redis (verify via Redis `MONITOR` or log)
- [ ] After 60s the cache is invalidated and a fresh Redis read occurs

## Complexity
**S** — Mostly additive changes to existing service methods; cache is a simple Map.

## Does Not Include
- Frontend period filter UI (Increment 3)
- BullMQ for cache invalidation (overkill — simple TTL map is sufficient)
