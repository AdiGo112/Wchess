# Leaderboard — Increment 1: Backend Redis Core

## Scope
Wire the Redis leaderboard into the game end flow. After every rated game, update the sorted set for the relevant variant. Expose endpoints to read the global top-100 and a specific user's rank.

## What Gets Built
- `ZADD leaderboard:{variant} {newRating} {userId}` called inside `GameService` after Glicko-2 update
- `GET /leaderboard/:variant` → top-100 players enriched from PostgreSQL (username, avatar)
- `GET /leaderboard/:variant/rank` → authenticated user's rank + score
- `LeaderboardService.seedFromDatabase()` rebuilds all sorted sets from PostgreSQL (run on startup if sets are empty)

## Files Created / Modified
| Action | File |
|---|---|
| Modify | `backend/src/leaderboard/leaderboard.service.ts` — add `updateRating()`, `getTopPlayers()`, `getUserRank()`, `seedFromDatabase()` |
| Modify | `backend/src/leaderboard/leaderboard.controller.ts` — add `GET /:variant` and `GET /:variant/rank` |
| Modify | `backend/src/game/game.service.ts` — call `leaderboardService.updateRating()` after `updateGlicko2()` on game end |
| Verify | `backend/src/leaderboard/leaderboard.module.ts` — ensure RedisModule imported |

## Acceptance Criteria
- [ ] Finish a game via Socket.io → Redis sorted set updated within 100ms
- [ ] `GET /leaderboard/blitz` returns array of 100 players with `{ rank, userId, username, rating, rd }`
- [ ] `GET /leaderboard/blitz/rank` (authenticated) returns `{ rank, rating, rd }` for current user
- [ ] `seedFromDatabase()` populates sorted sets correctly when called manually
- [ ] Leaderboard endpoint responds in < 50ms (Redis + single PostgreSQL `IN` query)

## Complexity
**M** — Redis operations are straightforward; the enrichment join and seed logic need care.

## Does Not Include
- Weekly/monthly time-scoped boards (Increment 2)
- 60-second cache layer (Increment 2)
- Frontend leaderboard page improvements (Increment 3)
