# Feature 12 — Frontend UI: Implementation Prompt — Increment 5 (Dark Mode + UI Polish)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

Add dark mode support, skeleton loaders, toast notifications, and error boundaries to ChessWeb. This is the visual polish pass that makes every page production-ready.

## Prerequisites (already exist)

- `frontend/src/stores/settingsStore.ts` — with `darkMode`, `toggleDarkMode()`
- `frontend/tailwind.config.js` — with `darkMode: 'class'` already set
- `frontend/index.html` — with dark mode init script already in `<head>`
- `react-hot-toast` installed: `npm install react-hot-toast`
- `react-error-boundary` installed: `npm install react-error-boundary`

## Tailwind Dark Mode Color Reference

```
bg-white          → dark:bg-chess-surface       (#16213e)
bg-gray-50        → dark:bg-chess-app-bg        (#1a1a2e)
bg-gray-100       → dark:bg-chess-surface-2     (#0f3460)
text-gray-900     → dark:text-gray-100
text-gray-700     → dark:text-gray-300
text-gray-500     → dark:text-gray-400
border-gray-200   → dark:border-gray-700
border-gray-300   → dark:border-gray-600
```

## Create `frontend/src/components/ui/Skeleton.tsx`

```typescript
import React from 'react';
import { cn } from '@/lib/utils'; // classnames helper — create if not exists

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-gray-200 dark:bg-chess-surface-2',
        className
      )}
      aria-busy="true"
      aria-label="Loading..."
    />
  );
}

// Preset sizes
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return (
    <Skeleton
      className="rounded-full flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}
```

## Create `frontend/src/components/ui/SkeletonBoard.tsx`

```typescript
import React from 'react';
import { Skeleton } from './Skeleton';

interface SkeletonBoardProps {
  size?: number; // board width in pixels
}

export function SkeletonBoard({ size = 400 }: SkeletonBoardProps) {
  const squareSize = size / 8;

  return (
    <div
      className="grid grid-cols-8"
      style={{ width: size, height: size }}
      aria-busy="true"
      aria-label="Loading chess board..."
    >
      {Array.from({ length: 64 }).map((_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        return (
          <div
            key={i}
            className={`
              animate-pulse
              ${isLight
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'bg-gray-300 dark:bg-gray-600'
              }
            `}
            style={{ width: squareSize, height: squareSize }}
          />
        );
      })}
    </div>
  );
}
```

## Create `frontend/src/components/ui/SkeletonCard.tsx`

```typescript
import React from 'react';
import { Skeleton, SkeletonText, SkeletonAvatar } from './Skeleton';

export function SkeletonGameCard() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
      <SkeletonAvatar size={36} />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SkeletonLeaderboardRow() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <Skeleton className="h-6 w-6" />
      <SkeletonAvatar size={32} />
      <Skeleton className="h-4 flex-1 max-w-[160px]" />
      <Skeleton className="h-4 w-16 ml-auto" />
    </div>
  );
}

export function SkeletonTournamentCard() {
  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}
```

## Create `frontend/src/components/ui/ErrorFallback.tsx`

```typescript
import React from 'react';
import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
    >
      {/* Chess king knocked over — visual metaphor */}
      <div className="text-6xl mb-4" aria-hidden="true">♚</div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
        {error?.message || 'An unexpected error occurred in this section.'}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-chess-accent text-white rounded-lg hover:bg-chess-accent/90 transition-colors font-medium"
      >
        Try again
      </button>
    </div>
  );
}

// Lightweight fallback for critical layout sections
export function MinimalErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-center">
      <p className="text-sm text-red-700 dark:text-red-400 mb-2">Failed to load</p>
      <button
        onClick={resetErrorBoundary}
        className="text-xs text-red-600 dark:text-red-400 underline"
      >
        Retry
      </button>
    </div>
  );
}
```

## Create `frontend/src/lib/utils.ts` (if not exists)

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Install deps if needed: `npm install clsx tailwind-merge`

## Modify `frontend/src/App.tsx` — Add Toaster

```typescript
import toast, { Toaster } from 'react-hot-toast';
import { useSettingsStore } from '@/stores/settingsStore';

// Inside App component, add Toaster as the last child of QueryClientProvider:
export default function App() {
  const darkMode = useSettingsStore((s) => s.darkMode);

  return (
    <QueryClientProvider client={queryClient}>
      {/* ... existing router ... */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: darkMode ? '#16213e' : '#ffffff',
            color: darkMode ? '#f3f4f6' : '#111827',
            border: `1px solid ${darkMode ? '#374151' : '#e5e7eb'}`,
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#769656', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#e94560', secondary: '#fff' },
          },
        }}
      />
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

## Modify `frontend/src/router/index.tsx` — Wrap Routes with ErrorBoundary

```typescript
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ui/ErrorFallback';

// Wrap every protected route:
<Route
  path="/game/:id"
  element={
    <ProtectedRoute>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<SkeletonBoard size={560} />}>
          <GamePage />
        </Suspense>
      </ErrorBoundary>
    </ProtectedRoute>
  }
/>

<Route
  path="/puzzles"
  element={
    <ProtectedRoute>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <Suspense fallback={<div className="p-8"><SkeletonBoard size={400} /></div>}>
          <PuzzlePage />
        </Suspense>
      </ErrorBoundary>
    </ProtectedRoute>
  }
/>

<Route
  path="/leaderboard"
  element={
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Suspense fallback={<div className="p-8 space-y-3">{Array.from({length:10}).map((_,i)=><SkeletonLeaderboardRow key={i}/>)}</div>}>
        <LeaderboardPage />
      </Suspense>
    </ErrorBoundary>
  }
/>

// Apply the same pattern to all remaining routes
```

## Dark Mode Updates for Core Layout Components

### `frontend/src/components/layout/NavBar.tsx`

```typescript
// Replace or add these Tailwind classes:
// Container:
className="bg-white dark:bg-chess-surface border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50"

// Logo text:
className="text-gray-900 dark:text-white font-bold text-xl"

// Nav links:
className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"

// Active nav link:
className="text-chess-accent font-medium"

// User menu button:
className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"

// Dropdown menu:
className="bg-white dark:bg-chess-surface-2 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
```

### `frontend/src/components/layout/PageLayout.tsx`

```typescript
// Page background:
className="min-h-screen bg-gray-50 dark:bg-chess-app-bg"

// Content container:
className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
```

### `frontend/src/components/ui/Modal.tsx`

```typescript
// Overlay:
className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4"

// Modal panel:
className="bg-white dark:bg-chess-surface rounded-xl shadow-2xl max-w-md w-full p-6"

// Modal title:
className="text-lg font-bold text-gray-900 dark:text-white"

// Close button:
className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
```

## Loading State Pattern for Data Pages

Apply this pattern to every page that fetches data:

```typescript
// Example: LeaderboardPage.tsx
import { SkeletonLeaderboardRow } from '@/components/ui/SkeletonCard';

export function LeaderboardPage() {
  const { data, isLoading, error } = useLeaderboard();

  if (isLoading) {
    return (
      <PageLayout>
        <div className="space-y-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonLeaderboardRow key={i} />
          ))}
        </div>
      </PageLayout>
    );
  }

  if (error) {
    // ErrorBoundary catches thrown errors, but network errors come through here
    return (
      <PageLayout>
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          Failed to load leaderboard. Please try again.
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* actual content */}
    </PageLayout>
  );
}
```

## Toast Usage Examples

Import and call `toast` from react-hot-toast wherever these events occur:

```typescript
import toast from 'react-hot-toast';

// Match found (in matchmaking socket handler)
toast.success('Match found! Starting game...');

// Draw offered
toast('Your opponent offered a draw', { icon: '🤝' });

// Friend came online (in social socket handler)
toast(`${username} is now online`, { icon: '🟢', duration: 3000 });

// Settings saved
toast.success('Settings saved');

// Error cases
toast.error('Connection lost. Reconnecting...');
toast.error('Failed to send message');

// Copy link
toast.success('Game link copied to clipboard');
```

## Verification Steps

1. Toggle dark mode from settings — all backgrounds flip to dark navy
2. No white flash on reload for dark-mode users
3. Navigate to `/leaderboard` — skeleton rows appear while loading, then content appears
4. Navigate to `/puzzles` — skeleton board appears while loading
5. Trigger a match-found event — toast appears in top-right corner
6. Cause an error in a feature (temporarily throw in a component) — ErrorFallback shows, other pages unaffected
7. Click "Try again" on ErrorFallback — component re-renders normally
8. Check dark mode contrast — all text is legible (gray-100/gray-300 on chess-surface)
9. Toast notifications appear in dark style when dark mode is enabled
