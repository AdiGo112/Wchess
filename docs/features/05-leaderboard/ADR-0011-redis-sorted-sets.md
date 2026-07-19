# ADR-0011: Redis Sorted Sets for Leaderboard Storage
**Status:** Accepted
**Date:** 2026-06-24

## Context
The leaderboard needs to support: adding/updating a player's rating score on every game end, retrieving the top 100 players, and fetching a specific player's rank — all with low latency. A PostgreSQL query like `SELECT ... ORDER BY rating DESC LIMIT 100` with `COUNT(*) FILTER (...)` for rank would hit the DB on every leaderboard page load and every game end, under concurrent writes.

## Decision
Use Redis Sorted Sets (one per variant: `leaderboard:bullet`, `leaderboard:blitz`, `leaderboard:rapid`, `leaderboard:classical`) with the player's Glicko-2 rating as the score. Operations:
- `ZADD leaderboard:{variant} {rating} {userId}` on game end (O(log N))
- `ZREVRANGE leaderboard:{variant} 0 99 WITHSCORES` for top-100 (O(log N + K))
- `ZREVRANK leaderboard:{variant} {userId}` for a player's rank (O(log N))
- `ZSCORE leaderboard:{variant} {userId}` for a player's current score

The sorted set is enriched with usernames and avatars from PostgreSQL only at read time (top-100 only), keeping the hot path Redis-only.

## Consequences
**Positive:** Sub-millisecond rank/score lookups. O(log N) inserts even with millions of players. No DB read for rank on game end.

**Negative:** Redis is not the source of truth — if Redis is flushed, leaderboard must be rebuilt from PostgreSQL via `seedFromDatabase()`. Sorted sets don't support complex filters (country, age group) without separate sets per filter combination.

**Neutral:** Weekly/monthly boards require separate sorted sets with time-scoped keys (`leaderboard:blitz:2026-W25`) updated only during their time window.
