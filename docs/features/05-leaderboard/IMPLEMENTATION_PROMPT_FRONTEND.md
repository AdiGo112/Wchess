# Feature 05 — Leaderboard: Frontend Implementation Prompt

Copy and paste the following prompt into Claude Code to implement the full frontend.

---

## Prompt

```
Implement the leaderboard frontend for ChessWeb (React + TypeScript + Tailwind CSS + React Query).

## Context

- Frontend is at frontend/src/
- React Query (TanStack Query v5) is already configured with a QueryClient
- Axios instance is at frontend/src/lib/axios.ts with JWT interceptor
- Auth context provides { user: { userId, username } | null }
- Tailwind CSS is configured
- React Router v6 is used for routing

## Files to Create

### frontend/src/hooks/useLeaderboard.ts

```typescript
import { useQuery } from '@tanstack/react-query';
import axios from '../lib/axios';

export type ChessVariant = 'bullet' | 'blitz' | 'rapid' | 'classical';
export type LeaderboardPeriod = 'all-time' | 'weekly' | 'monthly';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  gamesPlayed: number;
  winRate: number;
}

export interface UserRankResult {
  rank: number | null;
  userId: string;
  username: string;
  rating: number | null;
  gamesPlayed: number;
  winRate: number;
}

const PERIOD_PATH: Record<LeaderboardPeriod, string> = {
  'all-time': '/leaderboard',
  'weekly': '/leaderboard/weekly',
  'monthly': '/leaderboard/monthly',
};

export function useLeaderboard(variant: ChessVariant, period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['leaderboard', variant, period],
    queryFn: async () => {
      const path = PERIOD_PATH[period];
      const { data } = await axios.get(path, { params: { variant, limit: 100 } });
      return data as { variant: string; period: string; total: number; entries: LeaderboardEntry[] };
    },
    staleTime: period === 'all-time' ? 10_000 : 60_000,  // 10s for all-time, 60s for time-scoped
  });
}

export function useMyRank(variant: ChessVariant) {
  return useQuery({
    queryKey: ['leaderboard', 'me', variant],
    queryFn: async () => {
      const { data } = await axios.get('/leaderboard/me', { params: { variant } });
      return data as UserRankResult;
    },
    staleTime: 30_000,
  });
}
```

### frontend/src/components/leaderboard/LeaderboardTable.tsx

Props:
- entries: LeaderboardEntry[]
- myUserId: string | undefined
- myRank: UserRankResult | undefined

Renders:
- A `<table>` with Tailwind styling
- Header row: # | Player | Rating | Games | Win Rate
- Body rows mapped from entries
- Each row: rank number in monospace, avatar circle (first letter of username, colored based on hash of userId), username bold, rating in blue, gamesPlayed, winRate as "X%"
- Own row (entries.find(e => e.userId === myUserId)): add className "bg-yellow-100 font-semibold"
- If myRank is provided and myRank.rank > entries.length (user outside top 100):
  - After the last entry row, add a `<tr>` with a single `<td colSpan={5}` showing "..." in gray
  - Then add a row for the user with their actual rank, highlighted in yellow-100

### frontend/src/pages/LeaderboardPage.tsx

State:
- activeVariant: ChessVariant (default 'blitz')
- activePeriod: LeaderboardPeriod (default 'all-time')

Calls:
- useLeaderboard(activeVariant, activePeriod)
- useMyRank(activeVariant)
- useAuth() for current user

Layout:
1. Page title "Leaderboard" in large heading
2. Variant tab group (4 buttons: Bullet, Blitz, Rapid, Classical). Active tab: border-b-2 border-blue-600 text-blue-600, inactive: text-gray-500 hover:text-gray-700
3. Period selector (3 buttons: All-time, Weekly, Monthly). Styled as pill buttons. Active: bg-blue-600 text-white, inactive: bg-gray-100 text-gray-700
4. If loading: render skeleton (8 rows of gray pulsing bars, 5 columns)
5. If error: render error state with retry button
6. If data: render LeaderboardTable with entries, myUserId, myRank

### Skeleton Component (inline or separate)

```tsx
function LeaderboardSkeleton() {
  return (
    <div className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 py-3 border-b border-gray-100">
          <div className="h-4 w-8 bg-gray-200 rounded" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-12 bg-gray-200 rounded" />
          <div className="h-4 w-12 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
```

## Add Route

In frontend/src/App.tsx (or router configuration):
```tsx
<Route path="/leaderboard" element={<LeaderboardPage />} />
```

## Add Navigation Link

In the main navigation component, add a link to /leaderboard with a trophy icon (or text "Leaderboard").

## Verification

1. Run the app: cd frontend && npm run dev
2. Navigate to /leaderboard
3. Default Blitz all-time board loads with entries
4. Click "Rapid" tab — table updates to rapid rankings
5. Click "Weekly" — table updates to weekly blitz
6. Your own row should be highlighted in yellow if you are logged in and have played rated games
7. If you are outside top 100, your row appears at the bottom after "..."
```
