# Feature 05 — Leaderboard

## Goal

Show ranked player standings that update in real-time after each rated game ends. Players can compare themselves to the global top 100 and track their ranking over different time periods and game variants.

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|-----------|
| LB-1 | Player | View the top 100 players globally | I can see who the best players are |
| LB-2 | Player | Filter the leaderboard by variant (Bullet/Blitz/Rapid/Classical) | I can see rankings for the format I play most |
| LB-3 | Player | See my own rank even when I'm outside the top 100 | I know exactly where I stand |
| LB-4 | Player | View weekly and monthly leaderboards | I can compete in shorter-term rankings without being overshadowed by all-time leaders |
| LB-5 | Player | See rating, games played, and win rate for each player | I can evaluate how dominant a player's score actually is |

## Dependencies

| Feature | Why needed |
|---------|-----------|
| 01-auth | User identity — userId and username for leaderboard entries |
| 02-game-engine | Rating updates emitted on game end — GameService triggers LeaderboardService |

## Output Artifacts

### Backend Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /leaderboard | Top 100 all-time for a variant |
| GET | /leaderboard/weekly | Top 100 for the current week |
| GET | /leaderboard/monthly | Top 100 for the current month |
| GET | /leaderboard/me | Authenticated user's own rank and stats |

### Internal Events

- `LeaderboardService.updateRating(userId, newRating, variant)` — called by GameService after each rated game
- Redis ZADD on every game end
- Redis ZREVRANK for user rank lookup

## Non-Goals (v1)

- Per-country leaderboards
- Team leaderboards
- Historical rating graphs (planned for analytics feature)
- Real-time WebSocket push for leaderboard changes (polling via HTTP is sufficient)
