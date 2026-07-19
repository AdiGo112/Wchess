# Feature 08 — Puzzles: Increment 5 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 5 of the Puzzles feature for ChessWeb, a NestJS + React chess application. Increments 1–4 are complete: the full backend is working and `/puzzles/:id` renders an interactive solving board. This increment is frontend-only and adds puzzle browsing, discovery, and stats display.

## What Increment 5 Delivers

- `/puzzles` — paginated, filterable puzzle list page
- `/puzzles/daily` — dedicated daily puzzle page
- `DailyPuzzleWidget` — embeddable widget for the dashboard
- `StreakDisplay` — shows the user's consecutive daily puzzle streak
- `PuzzleRatingDisplay` — shows the user's Glicko-2 puzzle rating and deviation
- `PuzzleListFilters` — theme dropdown + rating range slider
- `PuzzleCard` — single puzzle row/card in the list
- TanStack Query hooks for all new data fetching

## Project Context

- **Frontend**: React 18, TypeScript, TanStack Query v5, Zustand, React Router v6
- **API base URL**: `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`
- **Auth**: `useAuthStore((s) => s.accessToken)` for JWT; stats endpoint requires auth
- **Existing file**: `frontend/src/api/puzzles.ts` — already has `fetchPuzzleById`, `fetchNextPuzzle`, `submitAttempt`

## Step 1: Extend API Client

Add to `frontend/src/api/puzzles.ts`:
```typescript
export async function fetchDailyPuzzle() {
  const res = await fetch(`${API_URL}/puzzles/daily`);
  if (!res.ok) throw new Error('Daily puzzle unavailable');
  return res.json();
}

export interface PuzzleListParams {
  theme?: string;
  minRating?: number;
  maxRating?: number;
  page?: number;
  limit?: number;
}

export async function fetchPuzzleList(params: PuzzleListParams = {}) {
  const query = new URLSearchParams();
  if (params.theme) query.set('theme', params.theme);
  if (params.minRating !== undefined) query.set('minRating', String(params.minRating));
  if (params.maxRating !== undefined) query.set('maxRating', String(params.maxRating));
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${API_URL}/puzzles?${query}`);
  if (!res.ok) throw new Error('Failed to fetch puzzles');
  return res.json() as Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
}

export async function fetchPuzzleThemes() {
  const res = await fetch(`${API_URL}/puzzles/themes`);
  if (!res.ok) throw new Error('Failed to fetch themes');
  return res.json() as Promise<{ themes: { name: string; count: number }[] }>;
}

export async function fetchPuzzleStats(token: string) {
  const res = await fetch(`${API_URL}/puzzles/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch puzzle stats');
  return res.json();
}
```

## Step 2: TanStack Query Hooks

Create `frontend/src/hooks/useDailyPuzzle.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchDailyPuzzle } from '../api/puzzles';

export function useDailyPuzzle() {
  return useQuery({
    queryKey: ['puzzle', 'daily'],
    queryFn: fetchDailyPuzzle,
    staleTime: 60 * 60 * 1000, // 1 hour — daily puzzle changes once per day
  });
}
```

Create `frontend/src/hooks/usePuzzleList.ts`:
```typescript
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchPuzzleList, PuzzleListParams } from '../api/puzzles';

export function usePuzzleList(params: PuzzleListParams) {
  return useQuery({
    queryKey: ['puzzles', 'list', params],
    queryFn: () => fetchPuzzleList(params),
    placeholderData: keepPreviousData, // smooth pagination — no flash between pages
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

Create `frontend/src/hooks/usePuzzleThemes.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleThemes } from '../api/puzzles';

export function usePuzzleThemes() {
  return useQuery({
    queryKey: ['puzzles', 'themes'],
    queryFn: fetchPuzzleThemes,
    staleTime: Infinity, // theme list is effectively static
  });
}
```

Create `frontend/src/hooks/usePuzzleStats.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { fetchPuzzleStats } from '../api/puzzles';
import { useAuthStore } from '../store/authStore'; // adjust to your auth store path

export function usePuzzleStats() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['puzzles', 'stats', token],
    queryFn: () => fetchPuzzleStats(token!),
    enabled: !!token, // only fetch when authenticated
    staleTime: 60 * 1000, // 1 minute
  });
}
```

## Step 3: PuzzleCard Component

Create `frontend/src/components/puzzle/PuzzleCard.tsx`:
```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface PuzzleCardProps {
  id: string;
  rating: number;
  themes: string[];
}

export function PuzzleCard({ id, rating, themes }: PuzzleCardProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
      }}
    >
      <div>
        <span style={{ fontWeight: 600, marginRight: 12 }}>#{id}</span>
        <span style={{ color: '#718096', fontSize: 14 }}>
          {themes.slice(0, 3).join(', ')}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span
          style={{
            backgroundColor: '#ebf4ff',
            color: '#2b6cb0',
            padding: '2px 10px',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {Math.round(rating)}
        </span>
        <button
          onClick={() => navigate(`/puzzles/${id}`)}
          style={{
            padding: '6px 16px',
            backgroundColor: '#3182ce',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Solve
        </button>
      </div>
    </div>
  );
}
```

## Step 4: PuzzleListFilters Component

Create `frontend/src/components/puzzle/PuzzleListFilters.tsx`:
```typescript
import React from 'react';
import { usePuzzleThemes } from '../../hooks/usePuzzleThemes';

interface FiltersProps {
  theme: string;
  minRating: number;
  maxRating: number;
  onThemeChange: (theme: string) => void;
  onRatingChange: (min: number, max: number) => void;
}

export function PuzzleListFilters({
  theme,
  minRating,
  maxRating,
  onThemeChange,
  onRatingChange,
}: FiltersProps) {
  const { data: themesData } = usePuzzleThemes();

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 20,
        padding: '16px',
        backgroundColor: '#f7fafc',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5568' }}>Theme</span>
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value)}
          style={{
            padding: '6px 12px',
            border: '1px solid #cbd5e0',
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          <option value="">All themes</option>
          {themesData?.themes.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count.toLocaleString()})
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5568' }}>
          Min Rating: {minRating}
        </span>
        <input
          type="range"
          min={600}
          max={3000}
          step={50}
          value={minRating}
          onChange={(e) => onRatingChange(Number(e.target.value), maxRating)}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#4a5568' }}>
          Max Rating: {maxRating}
        </span>
        <input
          type="range"
          min={600}
          max={3000}
          step={50}
          value={maxRating}
          onChange={(e) => onRatingChange(minRating, Number(e.target.value))}
        />
      </label>
    </div>
  );
}
```

## Step 5: StreakDisplay Component

Create `frontend/src/components/puzzle/StreakDisplay.tsx`:
```typescript
import React from 'react';
import { usePuzzleStats } from '../../hooks/usePuzzleStats';

export function StreakDisplay() {
  const { data: stats, isLoading } = usePuzzleStats();

  if (isLoading) return <span>Loading streak...</span>;
  if (!stats) return <span style={{ color: '#718096' }}>Log in to track streak</span>;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        backgroundColor: stats.streak > 0 ? '#fefcbf' : '#f7fafc',
        border: '1px solid #f6e05e',
        borderRadius: 20,
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      <span role="img" aria-label="streak">🔥</span>
      <span>{stats.streak} day streak</span>
    </div>
  );
}
```

## Step 6: PuzzleRatingDisplay Component

Create `frontend/src/components/puzzle/PuzzleRatingDisplay.tsx`:
```typescript
import React from 'react';
import { usePuzzleStats } from '../../hooks/usePuzzleStats';

export function PuzzleRatingDisplay() {
  const { data: stats } = usePuzzleStats();

  if (!stats) return null;

  return (
    <div style={{ fontSize: 14, color: '#4a5568' }}>
      Puzzle Rating:{' '}
      <strong style={{ fontSize: 18, color: '#2d3748' }}>
        {Math.round(stats.currentRating)}
      </strong>
      <span style={{ color: '#718096', marginLeft: 4 }}>
        ±{Math.round(stats.ratingDeviation)}
      </span>
    </div>
  );
}
```

## Step 7: DailyPuzzleWidget

Create `frontend/src/components/puzzle/DailyPuzzleWidget.tsx`:
```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDailyPuzzle } from '../../hooks/useDailyPuzzle';
import { Chessboard } from 'react-chessboard';

export function DailyPuzzleWidget() {
  const navigate = useNavigate();
  const { data: puzzle, isLoading } = useDailyPuzzle();

  if (isLoading) return <div>Loading today's puzzle...</div>;
  if (!puzzle) return null;

  return (
    <div
      style={{
        width: 260,
        padding: 16,
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        backgroundColor: 'white',
      }}
    >
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Daily Puzzle</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#718096' }}>
        Rating: {Math.round(puzzle.rating)} · {puzzle.themes[0]}
      </p>
      <div style={{ pointerEvents: 'none', marginBottom: 12 }}>
        <Chessboard
          position={puzzle.fen}
          boardWidth={228}
          arePiecesDraggable={false}
        />
      </div>
      <button
        onClick={() => navigate('/puzzles/daily')}
        style={{
          width: '100%',
          padding: '8px 0',
          backgroundColor: '#38a169',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Solve Today's Puzzle
      </button>
    </div>
  );
}
```

## Step 8: PuzzleListPage

Create `frontend/src/pages/PuzzleListPage.tsx`:
```typescript
import React, { useState } from 'react';
import { usePuzzleList } from '../hooks/usePuzzleList';
import { PuzzleCard } from '../components/puzzle/PuzzleCard';
import { PuzzleListFilters } from '../components/puzzle/PuzzleListFilters';
import { StreakDisplay } from '../components/puzzle/StreakDisplay';
import { PuzzleRatingDisplay } from '../components/puzzle/PuzzleRatingDisplay';

export default function PuzzleListPage() {
  const [theme, setTheme] = useState('');
  const [minRating, setMinRating] = useState(600);
  const [maxRating, setMaxRating] = useState(3000);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = usePuzzleList({
    theme: theme || undefined,
    minRating: minRating > 600 ? minRating : undefined,
    maxRating: maxRating < 3000 ? maxRating : undefined,
    page,
    limit: 20,
  });

  function handleThemeChange(newTheme: string) {
    setTheme(newTheme);
    setPage(1); // reset to page 1 on filter change
  }

  function handleRatingChange(min: number, max: number) {
    setMinRating(min);
    setMaxRating(max);
    setPage(1);
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Puzzles</h1>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <StreakDisplay />
          <PuzzleRatingDisplay />
        </div>
      </div>

      <PuzzleListFilters
        theme={theme}
        minRating={minRating}
        maxRating={maxRating}
        onThemeChange={handleThemeChange}
        onRatingChange={handleRatingChange}
      />

      {isLoading && <div>Loading puzzles...</div>}

      {data && (
        <>
          <div
            style={{
              opacity: isFetching ? 0.6 : 1,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {data.data.map((puzzle) => (
              <PuzzleCard
                key={puzzle.id}
                id={puzzle.id}
                rating={puzzle.rating}
                themes={puzzle.themes}
              />
            ))}
            {data.data.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#718096' }}>
                No puzzles match your filters.
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 16,
            }}
          >
            <span style={{ fontSize: 14, color: '#718096' }}>
              {data.total.toLocaleString()} puzzles · Page {data.page} of {data.totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  padding: '6px 16px',
                  border: '1px solid #cbd5e0',
                  borderRadius: 4,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.5 : 1,
                  backgroundColor: 'white',
                }}
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                style={{
                  padding: '6px 16px',
                  border: '1px solid #cbd5e0',
                  borderRadius: 4,
                  cursor: page >= data.totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= data.totalPages ? 0.5 : 1,
                  backgroundColor: 'white',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

## Step 9: PuzzleDailyPage

Create `frontend/src/pages/PuzzleDailyPage.tsx`:
```typescript
import React from 'react';
import { useDailyPuzzle } from '../hooks/useDailyPuzzle';
import { useNavigate } from 'react-router-dom';

export default function PuzzleDailyPage() {
  const navigate = useNavigate();
  const { data: puzzle, isLoading } = useDailyPuzzle();

  if (isLoading) return <div>Loading today's puzzle...</div>;
  if (!puzzle) return <div>No daily puzzle available.</div>;

  // Redirect to the puzzle page for solving
  React.useEffect(() => {
    navigate(`/puzzles/${puzzle.id}`, { replace: true });
  }, [puzzle.id, navigate]);

  return <div>Redirecting to today's puzzle...</div>;
}
```

## Step 10: Add Routes

In `frontend/src/router/index.tsx`, add:
```typescript
const PuzzleListPage = lazy(() => import('../pages/PuzzleListPage'));
const PuzzleDailyPage = lazy(() => import('../pages/PuzzleDailyPage'));

// In Routes:
<Route
  path="/puzzles"
  element={
    <Suspense fallback={<div>Loading...</div>}>
      <PuzzleListPage />
    </Suspense>
  }
/>
<Route
  path="/puzzles/daily"
  element={
    <Suspense fallback={<div>Loading...</div>}>
      <PuzzleDailyPage />
    </Suspense>
  }
/>
```

**Route order note:** `/puzzles/daily` must be registered before `/puzzles/:id` so it is matched as a literal route.

## Verification

```bash
# Start the dev server
cd frontend && npm run dev

# Checklist:
# 1. Navigate to /puzzles — list renders with puzzle cards
# 2. Select "fork" from the theme dropdown — list refetches showing only fork puzzles
# 3. Adjust the rating slider — list refetches with new rating range
# 4. Click "Next" / "Previous" — page changes without flash (placeholderData)
# 5. Click "Solve" on any puzzle card — navigates to /puzzles/:id
# 6. Navigate to /puzzles/daily — redirects to /puzzles/<daily-id>
# 7. Log in and check streak display shows "N day streak"
# 8. Check PuzzleRatingDisplay shows a rating and deviation
# 9. Add DailyPuzzleWidget to the dashboard page to confirm it renders correctly
```
