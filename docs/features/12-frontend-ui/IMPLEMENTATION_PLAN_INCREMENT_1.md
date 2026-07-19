# Feature 12 — Frontend UI: Increment 1 Implementation Plan

## Scope

Create all five Zustand stores plus the new `settingsStore`. Each store uses the `create<State>()` pattern with proper TypeScript interfaces. `authStore` uses `persist` middleware with a `partialize` function that explicitly excludes `accessToken` and `isAuthenticated` from localStorage. `settingsStore` uses `persist` with full state. The remaining four stores (`gameStore`, `matchmakingStore`, `notificationStore`, `socialStore`) have no persistence — they are entirely ephemeral.

This increment also adds the `frontend/src/lib/queryClient.ts` file with the `QueryClient` configuration (needed before React Query hooks in Increment 2), and the `frontend/src/lib/queryKeys.ts` file with all cache key factory functions.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/stores/authStore.ts` | Create |
| `frontend/src/stores/gameStore.ts` | Create |
| `frontend/src/stores/matchmakingStore.ts` | Create |
| `frontend/src/stores/notificationStore.ts` | Create |
| `frontend/src/stores/socialStore.ts` | Create |
| `frontend/src/stores/settingsStore.ts` | Create |
| `frontend/src/lib/queryClient.ts` | Create |
| `frontend/src/lib/queryKeys.ts` | Create |
| `frontend/src/types/settings.ts` | Create (BoardTheme, PieceSet, SoundEvent enums + BOARD_THEME_COLORS + SOUND_FILES constants) |
| `frontend/index.html` | Modify — add dark mode initialization script in `<head>` |
| `frontend/tailwind.config.js` | Modify — add `darkMode: 'class'` |
| `frontend/package.json` | Modify — add `zustand`, `@tanstack/react-query`, `react-hot-toast`, `react-error-boundary` |

## Acceptance Criteria

- [ ] `authStore.setAuth(user, token)` sets `isAuthenticated: true`, `user`, and `accessToken`
- [ ] `authStore.clearAuth()` resets all fields to null/false
- [ ] `localStorage.getItem('chessweb-auth')` after `setAuth` does NOT contain `accessToken`
- [ ] `localStorage.getItem('chessweb-auth')` after `setAuth` DOES contain `user.username`
- [ ] `gameStore.setState({ fen: '...' })` merges partial state without wiping other fields
- [ ] `gameStore.reset()` returns FEN to the starting position string
- [ ] `settingsStore.setBoardTheme('blue')` updates `boardTheme` to `'blue'`
- [ ] `localStorage.getItem('chessweb-settings')` contains updated `boardTheme` after `setBoardTheme`
- [ ] `settingsStore.toggleDarkMode()` adds `dark` class to `document.documentElement` when `darkMode` was false
- [ ] `settingsStore.toggleDarkMode()` removes `dark` class when `darkMode` was true
- [ ] Dark mode inline script in `index.html` runs before React renders (prevents flash)
- [ ] `tailwind.config.js` has `darkMode: 'class'`
- [ ] All stores have TypeScript interfaces with no `any` types
- [ ] `queryClient.ts` exports a `QueryClient` with default `staleTime: 30_000` and `gcTime: 5 * 60 * 1000`
- [ ] `queryKeys.ts` exports factory functions for all resource types

## Dependencies

- Zustand 4 installed (`npm install zustand`)
- `@tanstack/react-query@5` installed

## Complexity

**M** — Six stores with known shapes, persist middleware configuration is slightly tricky (partialize pattern), dark mode DOM side effect in store action. No async code, no network calls.
