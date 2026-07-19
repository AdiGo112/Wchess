# Feature 08 — Puzzles: Increment 5 Implementation Plan

## Scope

Increment 5 delivers the puzzle browsing and discovery UI. This includes a daily puzzle widget (usable on the dashboard or a dedicated `/puzzles/daily` page), a paginated and filterable puzzle list at `/puzzles`, a streak display showing consecutive days the user has solved the daily puzzle, and a puzzle rating display showing the user's current Glicko-2 puzzle rating from `GET /puzzles/stats`. The puzzle list supports filtering by theme (dropdown from `GET /puzzles/themes`) and rating range (slider). Selecting a puzzle from the list navigates to `/puzzles/:id` (Increment 4). This increment completes all five increments and makes the full feature production-ready.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/pages/PuzzleListPage.tsx` | Create |
| `frontend/src/pages/PuzzleDailyPage.tsx` | Create |
| `frontend/src/components/puzzle/DailyPuzzleWidget.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleListFilters.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleCard.tsx` | Create |
| `frontend/src/components/puzzle/StreakDisplay.tsx` | Create |
| `frontend/src/components/puzzle/PuzzleRatingDisplay.tsx` | Create |
| `frontend/src/hooks/usePuzzleList.ts` | Create |
| `frontend/src/hooks/useDailyPuzzle.ts` | Create |
| `frontend/src/hooks/usePuzzleStats.ts` | Create |
| `frontend/src/hooks/usePuzzleThemes.ts` | Create |
| `frontend/src/router/index.tsx` | Modify — add `/puzzles` and `/puzzles/daily` routes |

## Acceptance Criteria

- [ ] Navigating to `/puzzles/daily` renders the daily puzzle board (same FEN for all users on the same day)
- [ ] `DailyPuzzleWidget` renders on the dashboard with the daily puzzle FEN, rating, and a "Solve Today's Puzzle" link
- [ ] `/puzzles` renders a paginated list of puzzle cards showing ID, rating, and themes
- [ ] Selecting a theme from the dropdown re-fetches the list filtered by that theme
- [ ] Adjusting the rating range slider re-fetches the list with the new `minRating`/`maxRating` query params
- [ ] Clicking "Next page" / "Previous page" fetches the next/previous page from the API
- [ ] Each puzzle card has a "Solve" button that navigates to `/puzzles/:id`
- [ ] `StreakDisplay` shows the authenticated user's current streak (e.g., "7 day streak") fetched from `GET /puzzles/stats`
- [ ] `PuzzleRatingDisplay` shows the user's current puzzle Glicko-2 rating and RD (e.g., "1547 ± 45")
- [ ] `GET /puzzles/stats` is only called when the user is authenticated; the streak and rating components render a placeholder for unauthenticated users
- [ ] TanStack Query cache means navigating back to `/puzzles` after solving a puzzle does not re-fetch the list (uses staleTime)
- [ ] All new pages have route-level code splitting (React.lazy / Suspense)

## Complexity

**M** — Moderate. The browsing UI is largely standard React data-fetching patterns using TanStack Query with pagination and filter state. The main complexity is the filter state management (theme + rating range + page all need to reset page to 1 when filters change) and ensuring the daily puzzle widget does not re-mount the board component unnecessarily. No novel algorithms are introduced in this increment.
