# Feature 05 — Leaderboard: Dashboards

## Dashboard Views

### 1. All-Time Leaderboard (Default View)

The primary leaderboard view showing the top 100 players sorted by current rating for the selected variant.

**Location in UI:** Main navigation → "Leaderboard"

**Columns:**

| Column | Data Source | Notes |
|--------|-------------|-------|
| # Rank | Redis ZREVRANK | 1-indexed |
| Player | PostgreSQL User.username | Shown with avatar placeholder (first letter of username in colored circle) |
| Rating | Redis sorted set score | Integer display, e.g., 1847 |
| Games Played | PostgreSQL User.{variant}GamesPlayed | Total rated games in this variant |
| Win Rate | Computed: wins / gamesPlayed | Shown as percentage, e.g., "64%" |

**Own-row behavior:**
- If the authenticated user is within the top 100: their row is highlighted in yellow-100 background with bold text within the normal table position
- If the authenticated user is outside top 100: a divider ("...") appears after rank 100, followed by the user's row showing their actual rank (e.g., rank 347) with the same yellow highlight
- If the user is unranked (no rated games): a footer note reads "You are not yet ranked in Blitz. Play a rated game to appear on the leaderboard."

**Refresh rate:** Live — each HTTP request hits Redis ZREVRANGE directly (no response cache on all-time board)

---

### 2. Weekly Leaderboard

Shows the top players for the current ISO week (Monday 00:00 UTC to Sunday 23:59 UTC).

**Purpose:** Shorter-term competition. Resets every Monday, giving newer players a chance to top the charts week-over-week.

**Column behavior:** Same as All-Time, but only players who played at least one rated game this week appear.

**Cache:** 60-second Redis cache. A banner "Updated less than 1 minute ago" may be shown.

**Refresh rate:** Up to 60-second delay from the last game end.

---

### 3. Monthly Leaderboard

Shows the top players for the current calendar month (1st 00:00 UTC to last-day 23:59 UTC).

**Same structure as Weekly**, but scoped to the calendar month. Resets on the 1st of each month.

---

### 4. Variant Tabs

All three leaderboard views support a tab group at the top:

```
[ Bullet ]  [ Blitz ]  [ Rapid ]  [ Classical ]
```

Switching tabs replaces the table data by calling the appropriate endpoint with the new `variant` query param. The active tab is highlighted. Default tab on first load: Blitz.

---

## Data Sources Summary

| UI Element | Primary Source | Secondary Source |
|-----------|---------------|-----------------|
| Rank (#) | Redis ZREVRANK | — |
| Rating | Redis ZSCORE (via ZREVRANGE) | — |
| Username | PostgreSQL User.username | — |
| Games Played | PostgreSQL User.{variant}GamesPlayed | — |
| Win Rate | Computed from PostgreSQL | — |
| Weekly/Monthly cache | Redis String (60s TTL) | Falls back to Redis sorted set + PG |
| Total player count | Redis ZCARD | — |

## Loading States

- **Initial load:** Skeleton rows (8 placeholder rows with pulsing gray bars) replace the table
- **Tab switch:** Previous data remains visible briefly, then replaced by new data (no flash to empty)
- **Error state:** "Failed to load leaderboard. Please try again." with a Retry button

## Mobile Responsiveness

On screens narrower than 640px:
- Hide "Games Played" and "Win Rate" columns
- Show only: Rank, Player, Rating
- User's own highlighted row still appears at appropriate position
