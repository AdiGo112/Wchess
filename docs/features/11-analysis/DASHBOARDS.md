# Feature 11 — Analysis: Dashboards

## Overview

Once analysis data accumulates across many games, the `analysis` MongoDB collection becomes a rich data source for player improvement analytics. The following dashboard views could be built using aggregation pipelines on the `analysis` collection, exposed via a `/stats/analysis` endpoint group.

---

## Dashboard 1 — Player Accuracy Over Time

**What it shows:** A player's average game accuracy (white or black perspective averaged) plotted over the last 90 days.

**Chart type:** Line chart (x-axis = date, y-axis = accuracy %).

**Data source:** Aggregate `analysis` collection where `whiteUserId === userId OR blackUserId === userId`, group by day using `$dateToString` on `completedAt`, compute `$avg` of the relevant accuracy field per day.

**Use case:** Shows whether the player is improving over time. A rising trend line indicates improving decision quality.

**Sample query skeleton:**
```js
db.analysis.aggregate([
  { $match: { $or: [{ whiteUserId: userId }, { blackUserId: userId }], status: 'completed' } },
  { $addFields: { playerAccuracy: { $cond: [{ $eq: ['$whiteUserId', userId] }, '$accuracy.white', '$accuracy.black'] } } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }, avgAccuracy: { $avg: '$playerAccuracy' } } },
  { $sort: { _id: 1 } }
])
```

---

## Dashboard 2 — Blunder Rate by Time Control

**What it shows:** For each variant (blitz, rapid, bullet), how many blunders per game the player averages.

**Chart type:** Bar chart (x-axis = variant, y-axis = average blunders per game).

**Data source:** Join analysis with the games table (PostgreSQL join needed, or add `variant` field to the analysis document when analysis is saved). Unwind `moves`, filter where `classification === 'blunder'`, group by `gameId`, then group by `variant`.

**Use case:** Many players blunder more in faster time controls. This dashboard quantifies the gap and helps players decide which time controls to focus on.

---

## Dashboard 3 — Move Classification Distribution

**What it shows:** For a given player's last 50 games, what percentage of their moves fall into each classification bucket: brilliant, good, inaccuracy, mistake, blunder.

**Chart type:** Donut or pie chart with 5 segments, color-coded to match the in-board colors (cyan, green, yellow-orange, orange-red, dark red).

**Data source:** `analysis` collection, filter by userId, unwind `moves`, filter by `color` (white or black), group by `classification`, count.

**Use case:** A player who has a high inaccuracy rate but few blunders is making many small mistakes — they should focus on accuracy. A player with a high blunder rate needs to slow down.

---

## Dashboard 4 — ECO Opening Win Rate

**What it shows:** For each ECO family the player has played (as white or black), their win/loss/draw percentage in the last 6 months.

**Chart type:** Horizontal grouped bar chart (one bar group per opening family, three bars per group: win/draw/loss). Minimum 5 games per opening to show.

**Data source:** Join `analysis.ecoFamily` with game result from PostgreSQL `games.result`. Could be denormalized by storing the result on the analysis document.

**Use case:** Helps players identify which openings they perform best in. A player who wins 65% with the Sicilian but only 40% with the French should probably stick to the Sicilian.

---

## Dashboard 5 — Engine Evaluation Distribution

**What it shows:** A histogram of centipawn evaluations across all positions in a player's recent games — how often was the position balanced (−50 to +50 cp) vs. clearly advantageous (> 200 cp) vs. losing (< −200 cp)?

**Chart type:** Histogram / bar chart. X-axis: centipawn ranges (−1000, −500, −200, −100, −50, 0, +50, +100, +200, +500, +1000). Y-axis: count of positions.

**Data source:** Unwind `analysis.moves` for all games, extract `eval`, bucket into ranges.

**Use case:** A player who frequently reaches positions that are already −200 cp or worse before move 20 likely has opening preparation issues. A player who reaches balanced positions but loses them has conversion problems.

---

## Dashboard 6 — Common Mistake Positions

**What it shows:** The top 10 board positions (by FEN) where the player has made mistakes or blunders across multiple games. Shows the FEN, the move played, and the best move.

**Chart type:** Static list with mini board thumbnails (render chessboard at each FEN using `react-chessboard` in thumbnail mode).

**Data source:** Unwind `analysis.moves`, filter `classification IN ['mistake', 'blunder']` for the player's moves, group by FEN, sort by count descending, take top 10.

**Use case:** Pattern recognition — if a player consistently blunders in a specific pawn structure or tactical pattern, they can study it. This is the most powerful individual improvement tool in the dashboard suite.

---

## Implementation Notes

- Dashboards are read-only and can be built as a new `/stats/analysis` endpoint group (separate module, no BullMQ involvement).
- All aggregations should be cached in Redis for 1 hour to avoid expensive MongoDB scans on every page load.
- Chart rendering: use `recharts` npm package on the frontend (lightweight, React-native, no D3 dependency).
- All dashboard endpoints require JWT auth and only return data for the requesting user.
