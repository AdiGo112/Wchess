# Feature 12 — Frontend UI: Increment 5 Implementation Plan

## Scope

Add dark mode support throughout the application, skeleton loaders for all data-loading states, toast notifications via `react-hot-toast`, and error boundaries around all feature routes. This is the visual polish pass that covers every page that exists. Dark mode uses Tailwind's `class` strategy — the `dark` class on `<html>` enables all `dark:` variants. The dark mode initialization script in `index.html` prevents flash on load.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/index.html` | Modify — verify dark mode init script is present (from Increment 1) |
| `frontend/tailwind.config.js` | Modify — verify `darkMode: 'class'` is present (from Increment 1) |
| `frontend/src/components/ui/Skeleton.tsx` | Create — skeleton loader component with dark mode support |
| `frontend/src/components/ui/SkeletonBoard.tsx` | Create — 8×8 grid skeleton for chess board loading state |
| `frontend/src/components/ui/SkeletonCard.tsx` | Create — generic card skeleton (for lists, game history) |
| `frontend/src/components/ui/ErrorFallback.tsx` | Create — chess-themed error card with retry button |
| `frontend/src/components/layout/NavBar.tsx` | Modify — add dark mode classes (`dark:bg-chess-surface`) |
| `frontend/src/pages/GamePage.tsx` | Modify — add ErrorBoundary wrapper + skeleton loader |
| `frontend/src/pages/PuzzlePage.tsx` | Modify — add ErrorBoundary + skeleton loader |
| `frontend/src/pages/LeaderboardPage.tsx` | Modify — add ErrorBoundary + skeleton loader |
| `frontend/src/pages/TournamentListPage.tsx` | Modify — add ErrorBoundary + skeleton loader |
| `frontend/src/pages/ProfilePage.tsx` | Modify — add ErrorBoundary + skeleton loader |
| `frontend/src/pages/SocialPage.tsx` | Modify — add ErrorBoundary + skeleton loader |
| `frontend/src/router/index.tsx` | Modify — wrap all routes in `<ErrorBoundary FallbackComponent={ErrorFallback}>` |
| `frontend/src/App.tsx` | Modify — add `<Toaster>` from react-hot-toast at root |

## Dark Mode Class Pattern

All new and modified components must use Tailwind `dark:` variants:

```tsx
// Example pattern for surface cards
<div className="bg-white dark:bg-chess-surface text-gray-900 dark:text-gray-100">
  <h2 className="text-gray-700 dark:text-gray-300">Title</h2>
  <p className="text-gray-500 dark:text-gray-400">Body</p>
</div>
```

## Acceptance Criteria

- [ ] Clicking dark mode toggle changes all page backgrounds to `chess-surface` (#16213e)
- [ ] All text is legible in dark mode (contrast ratio ≥ 4.5:1)
- [ ] NavBar, Sidebar, all page containers, modals, and dropdowns have dark variants
- [ ] No white flash on page load for dark-mode users (inline script in index.html)
- [ ] Skeleton loaders display during React Query `isLoading: true` state
- [ ] `SkeletonBoard` renders an 8×8 gray grid while ChessBoard loads
- [ ] Skeleton loaders respect dark mode (`dark:bg-chess-surface-2`)
- [ ] Toast notifications appear in top-right corner
- [ ] Toast notifications use correct colors in both light and dark modes
- [ ] `toast.success('Match found!')` appears when matchmaking succeeds
- [ ] `toast.error('Connection lost')` appears on socket disconnect
- [ ] `toast.success('Theme saved')` appears after theme change
- [ ] Error boundaries catch thrown errors in all feature routes
- [ ] `ErrorFallback` shows a chess-themed message with a "Try again" button
- [ ] "Try again" button calls `resetErrorBoundary()` (React Error Boundary prop)
- [ ] Error boundaries do not crash the NavBar or global layout (only the feature section)
- [ ] Each page shows loading skeleton before data arrives (no blank white flash)
- [ ] `<Toaster>` is mounted once at the App root (not per-page)

## Toast Configuration

```typescript
// App.tsx — Toaster settings
<Toaster
  position="top-right"
  toastOptions={{
    duration: 4000,
    style: {
      background: darkMode ? '#16213e' : '#ffffff',
      color: darkMode ? '#f3f4f6' : '#111827',
    },
    success: { iconTheme: { primary: '#769656', secondary: '#fff' } },
    error:   { iconTheme: { primary: '#e94560', secondary: '#fff' } },
  }}
/>
```

## Dependencies

- Increment 1 complete (settingsStore with darkMode and toggleDarkMode)
- `react-hot-toast` and `react-error-boundary` installed
- All page components exist (from prior feature work)

## Complexity

**L** — Large scope: touching every page component for dark mode classes is tedious and requires careful visual review. Skeleton loaders require one per component type. Error boundaries are simple to add but every route needs one.
