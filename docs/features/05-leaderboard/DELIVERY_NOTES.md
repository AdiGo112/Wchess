# Feature 05 — Leaderboard: Delivery Notes

## Acceptance Criteria

### Backend

- [ ] `LeaderboardService.updateRating()` is called from `GameService.persistGame()` after each rated game
- [ ] ZADD is executed for all three sets (all-time, weekly, monthly) on each rating update
- [ ] `GET /leaderboard?variant=blitz` returns top 100 players sorted by rating descending
- [ ] Response includes: rank, userId, username, rating, gamesPlayed, winRate
- [ ] `GET /leaderboard/weekly` returns players for the current ISO week
- [ ] `GET /leaderboard/monthly` returns players for the current calendar month
- [ ] Time-scoped endpoints serve from cache within 60 seconds of the same request
- [ ] `GET /leaderboard/me` returns the authenticated user's rank even when outside top 100
- [ ] Invalid variant query param returns 400 INVALID_VARIANT
- [ ] All-time sorted set key TTL: none (permanent until user is removed)
- [ ] Weekly sorted set TTL: 8 days
- [ ] Monthly sorted set TTL: 32 days

### Frontend

- [ ] Leaderboard page shows variant tabs: Bullet | Blitz | Rapid | Classical
- [ ] Period selector: All-time | Weekly | Monthly
- [ ] Table columns: Rank, Player, Rating, Games Played, Win Rate
- [ ] Authenticated user's row is highlighted (yellow background) wherever it appears in the list
- [ ] If user is outside top 100, their row appears at the bottom of the table with their actual rank
- [ ] Loading skeleton shown during data fetch
- [ ] Switching variant or period triggers a new API request

## Edge Cases

### User With No Rated Games

- ZREVRANK returns nil
- `/me` response: `{ rank: null, rating: null, gamesPlayed: 0, winRate: 0 }`
- Frontend: display "Unranked" in the rank column for the user's own row

### User Has Played But Rating Dropped

- ZADD overwrites with latest rating (scores can go down)
- User rank may drop across sessions — this is expected behavior

### Week/Month Boundary

- On Monday 00:00 UTC (week rollover): a new weekly Redis key is created on the next game end
- The previous week's key expires after 8 days via TTL
- Users who played zero games in the new week have no entry in the new weekly set — they are "unranked" for that week

### Very Low Player Count

- If fewer than 100 players have rated games, ZREVRANGE returns all of them (not exactly 100)
- `total` field in response reflects actual count via ZCARD

### Concurrent ZADD Calls

- Redis ZADD is atomic; concurrent rating updates for different users are safe
- Two simultaneous games ending for the same user would result in whichever ZADD executes last winning — acceptable because ratings are processed sequentially per user in most cases

## Known Limitations

- `gamesPlayed` and `winRate` require an extra PostgreSQL query on every leaderboard read. For high traffic, these should be cached in a Redis hash alongside the sorted set score (planned for optimization, not in v1).
- Time-scoped boards reflect the user's rating at their LAST game in the period, not their highest rating during the period (no peak tracking in v1).
- No real-time WebSocket push for leaderboard changes. The all-time board reflects the most recent data on HTTP request; time-scoped boards have a 60s cache lag.

## Out of Scope (v1)

- Per-country leaderboards
- Team leaderboards
- Historical rating graphs
- Peak rating tracking for weekly/monthly boards
- Admin endpoint to reset or correct leaderboard entries
