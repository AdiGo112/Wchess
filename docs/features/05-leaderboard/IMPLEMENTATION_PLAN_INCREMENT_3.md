# Leaderboard — Increment 3: Frontend Leaderboard Page

## Scope
Complete the leaderboard frontend page. Add variant tabs (Bullet / Blitz / Rapid / Classical), a period filter (All Time / This Week / This Month), and highlight the authenticated user's own row.

## What Gets Built
- Variant tab bar: Bullet | Blitz | Rapid | Classical — clicking updates the API call
- Period toggle: All Time | This Week | This Month — maps to `?period=all|weekly|monthly`
- Table columns: Rank | Player (avatar + username) | Rating | RD (shown as ± range)
- Authenticated user's row pinned at the bottom of the table with their rank even if outside top-100
- Rank delta indicator: +3 / -2 green/red arrows (compare to previous visit, stored in localStorage)
- Loading skeleton while fetching, empty state if no data for selected period

## Files Created / Modified
| Action | File |
|---|---|
| Modify | `frontend/src/pages/Leaderboard.jsx` — add tabs, period toggle, enriched table, own-rank row |
| Create | `frontend/src/hooks/useLeaderboard.ts` — React Query hook: `useQuery(['leaderboard', variant, period], ...)` |
| Modify | `frontend/src/api/client.ts` — add `getLeaderboard(variant, period)` and `getMyRank(variant)` functions |

## Acceptance Criteria
- [ ] Switching variant tabs fetches new data without page reload
- [ ] Period toggle sends correct `?period=` query param
- [ ] Authenticated user's row always visible (own-rank endpoint fills it if outside top-100)
- [ ] RD column shows `1500 ± 87` format
- [ ] Page renders skeleton loader during fetch, no layout shift on data arrival
- [ ] Works on mobile (table scrolls horizontally on small screens)

## Complexity
**M** — React Query + tabs/filters pattern; own-rank row requires a separate API call.

## Does Not Include
- Country flags or other profile enrichment (post-v1)
- Real-time rank updates via Socket.io (post-v1 — poll on focus via React Query `refetchOnWindowFocus`)
