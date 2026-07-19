# Implementation Prompt — Leaderboard Increment 3: Frontend Page

Copy and paste this prompt into a new conversation to implement this increment.

---

You are building the leaderboard frontend page for ChessWeb, a React + Vite app using TypeScript, React Query, Zustand, and Tailwind CSS.

## What already exists
- `frontend/src/pages/Leaderboard.jsx` — basic page, renders a static table with no API calls
- `frontend/src/api/client.ts` — axios instance with `Authorization: Bearer {token}` interceptor
- `frontend/src/context/AuthContext.jsx` — provides `user` (current user object) and `isAuthenticated`
- Backend endpoints (already working):
  - `GET /leaderboard/:variant?period=all|weekly|monthly` → `LeaderboardEntry[]`
  - `GET /leaderboard/:variant/rank` (JWT required) → `{ rank: number; rating: number; rd: number }`

## Your task

### 1. Create the React Query hook

Create `frontend/src/hooks/useLeaderboard.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export type Variant = 'bullet' | 'blitz' | 'rapid' | 'classical';
export type Period = 'all' | 'weekly' | 'monthly';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  rd: number;
}

export function useLeaderboard(variant: Variant, period: Period) {
  return useQuery({
    queryKey: ['leaderboard', variant, period],
    queryFn: () =>
      apiClient.get<LeaderboardEntry[]>(`/leaderboard/${variant}?period=${period}`).then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMyRank(variant: Variant, enabled: boolean) {
  return useQuery({
    queryKey: ['leaderboard', variant, 'myrank'],
    queryFn: () =>
      apiClient.get<{ rank: number; rating: number; rd: number }>(`/leaderboard/${variant}/rank`).then(r => r.data),
    enabled,
    staleTime: 60_000,
  });
}
```

### 2. Rewrite `frontend/src/pages/Leaderboard.jsx`

Full component requirements:

**Variant tabs:** Bullet | Blitz | Rapid | Classical — default to `'blitz'`. Clicking a tab changes `variant` state and invalidates/refetches.

**Period toggle:** All Time | This Week | This Month — default to `'all'`. Styled as a segmented control (3 buttons, active one highlighted).

**Table:** Columns — Rank | Player | Rating | RD
- Rank: `#1`, `#2`, etc.
- Player: circular avatar (fallback to initials if `avatarUrl` is null) + username. Clicking username navigates to `/profile/:username`.
- Rating: numeric
- RD: shown as `± {rd}` in a muted color

**Own rank row:** If authenticated and user is not in the top-100 visible list, show a divider line then a pinned row at the bottom of the table showing the current user's rank from `useMyRank()`. If the user IS in the top-100, highlight that row with a subtle background color.

**Loading state:** Show a skeleton table (10 rows of shimmer) while `isLoading`.

**Empty state:** If no data for the selected period + variant combination, show "No games played yet for this period."

**Rank delta (stretch):** On first load, save current user's rank to `localStorage` key `leaderboard_rank_{variant}`. On subsequent loads compare to saved rank. Show `▲3` in green or `▼2` in red next to rank if changed. Update saved rank after display.

### 3. Add API functions to `frontend/src/api/client.ts`

```typescript
export const getLeaderboard = (variant: string, period: string) =>
  apiClient.get(`/leaderboard/${variant}?period=${period}`).then(r => r.data);

export const getMyLeaderboardRank = (variant: string) =>
  apiClient.get(`/leaderboard/${variant}/rank`).then(r => r.data);
```

## Styling notes
- Use Tailwind CSS throughout
- Variant tabs: `flex border-b` with active tab `border-b-2 border-blue-500 font-semibold`
- Period toggle: `inline-flex rounded-md shadow-sm` segmented control
- Own rank row: `bg-blue-50 dark:bg-blue-900/20 font-semibold`
- Table: `w-full text-sm`, `thead` with `text-gray-500 uppercase text-xs`, `tbody tr hover:bg-gray-50`
- Mobile: table wraps in `overflow-x-auto` div

## Verify your implementation
1. Navigate to `/leaderboard` → blitz all-time top players visible
2. Click "Bullet" tab → fetches bullet leaderboard
3. Click "This Week" → fetches `?period=weekly`
4. If logged in and outside top 100 → own rank row appears at bottom
5. If logged in and inside top 100 → own row is highlighted
6. Loading state shows skeleton for ~1s on slow connection (throttle in devtools)
7. Mobile viewport (375px) → table scrolls horizontally, tabs wrap gracefully
