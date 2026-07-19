# Feature 12 — Frontend UI: Automated Testing Prompt

Copy and paste this prompt into a fresh AI session to generate the complete test suite for Feature 12.

---

## Prompt

You are writing automated tests for a React 18 + TypeScript chess platform called ChessWeb. The feature you are testing is the frontend UI layer: Zustand stores, TanStack Query hooks, sound effects via Howler.js, board themes, dark mode, and mobile layout.

## Tech stack
- **Vitest** + **React Testing Library** for unit and component tests
- **msw v2** (Mock Service Worker) for HTTP mocking in hook tests
- **@testing-library/user-event v14** for user interactions
- **Playwright** for E2E browser tests
- **TypeScript** — all test files use `.test.ts` or `.test.tsx` extensions

## Project structure

```
frontend/src/
  stores/
    authStore.ts      — Zustand store for auth state
    gameStore.ts      — Zustand store for live game state
    settingsStore.ts  — Zustand store for board theme, piece set, sound mute, dark mode
    matchmakingStore.ts
    notificationStore.ts
    socialStore.ts
  hooks/api/
    useUser.ts        — useCurrentUser(), useUser(id)
    useGames.ts       — useGames(userId), useGame(gameId), useActiveGame(gameId, enabled)
    useLeaderboard.ts — useLeaderboard(variant, tc, page)
    usePuzzles.ts     — useDailyPuzzle(), usePuzzle(id), useSubmitPuzzle()
    useTournaments.ts — useTournaments(status), useTournament(id), useTournamentStandings(id)
    useSocial.ts      — useFriends(userId), useFriendRequests(userId), useAcceptFriendRequest()
    useNotifications.ts
  hooks/
    useSound.ts       — useSound() hook wrapping Howler.js
  components/
    layout/NavBar.tsx
    ui/ThemePicker.tsx
    ui/SoundToggle.tsx
```

## Zustand store shapes

```typescript
// authStore
interface AuthState {
  accessToken: string | null;
  user: { id: string; username: string; email: string; avatarUrl: string | null; rating: number } | null;
  isAuthenticated: boolean;
  setAuth: (user: AuthState['user'], token: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}
// Persist: 'chessweb-auth', partialize excludes accessToken and isAuthenticated

// gameStore
interface GameState {
  gameId: string | null;
  fen: string;
  turn: 'white' | 'black';
  clocks: { white: number; black: number };
  status: 'idle' | 'active' | 'ended';
  myColor: 'white' | 'black' | null;
  moves: string[];
  drawOffered: boolean;
  opponentId: string | null;
  setState: (partial: Partial<GameState>) => void;
  reset: () => void;
}

// settingsStore
interface SettingsState {
  boardTheme: 'classic' | 'green' | 'brown' | 'blue' | 'tournament';
  pieceSet: 'standard' | 'neo' | 'cburnett' | 'alpha';
  soundMuted: boolean;
  darkMode: boolean;
  setBoardTheme: (theme: SettingsState['boardTheme']) => void;
  setPieceSet: (set: SettingsState['pieceSet']) => void;
  setSoundMuted: (muted: boolean) => void;
  toggleDarkMode: () => void;
}
// Persist: 'chessweb-settings', all fields
// toggleDarkMode side effect: adds/removes 'dark' class on document.documentElement
```

## React Query hook details

```typescript
// staleTime overrides
useCurrentUser:   staleTime: 60_000
useLeaderboard:   staleTime: 30_000
useDailyPuzzle:   staleTime: Infinity
useActiveGame:    staleTime: 0, refetchInterval: 5_000 (when enabled)
useTournamentStandings: staleTime: 5_000, refetchInterval: 5_000

// Cache keys
['user', 'me']                     // useCurrentUser
['user', userId]                    // useUser(id)
['games', userId]                   // useGames(userId)
['game', gameId]                    // useGame(gameId)
['leaderboard', variant, tc]        // useLeaderboard
['puzzle', 'daily']                 // useDailyPuzzle
['puzzle', puzzleId]                // usePuzzle(id)
['tournaments', status]             // useTournaments
['tournament', id]                  // useTournament
['tournament', id, 'standings']     // useTournamentStandings
['friends', userId]                 // useFriends
['friendRequests', userId]          // useFriendRequests
['notifications', userId]           // useNotifications

// useAcceptFriendRequest — optimistic update:
//   onMutate: remove from ['friendRequests', userId] optimistically
//   onError: rollback
//   onSettled: invalidate ['friendRequests', userId] + ['friends', userId]
```

## Sound hook

```typescript
type SoundEvent = 'move' | 'capture' | 'check' | 'game-end' | 'illegal';

// useSound returns:
// { play: (event: SoundEvent) => void, setMuted: (muted: boolean) => void }
// Internally creates Howl instances once on mount
// Calls Howler.mute(true/false) when settingsStore.soundMuted changes
// Sound files: /sounds/move.mp3, capture.mp3, check.mp3, game-end.mp3, illegal.mp3
```

## What to write

### 1. Vitest unit tests for all 6 Zustand stores

For each store write tests covering:
- Default initial state is correct
- Each action mutates state correctly
- Actions do not mutate unrelated state fields
- `persist` stores write to localStorage with correct key
- `persist` partialize (authStore) excludes `accessToken` and `isAuthenticated`
- `settingsStore.toggleDarkMode()` side effect on `document.documentElement.classList`

Reset stores between tests using `store.setState(defaultState, true)` (Zustand replace mode).

### 2. Vitest + msw hook tests for all React Query hooks

For each hook write tests covering:
- Fetches data on mount and returns correct shape
- `isLoading` is true before data resolves
- Returns error state when API returns 500
- Respects `staleTime` — same query key within stale window does not trigger network request
- `refetchInterval` triggers refetch for `useActiveGame` and `useTournamentStandings`
- `useAcceptFriendRequest` optimistic update: list updates immediately, rolls back on error
- `useDailyPuzzle` staleTime: Infinity — never background refetches
- `useLogout` mutation calls `queryClient.clear()` and redirects to /login

Use this wrapper for hooks that need QueryClientProvider:
```typescript
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

### 3. Component tests

**NavBar.test.tsx**:
- Shows username when `isAuthenticated: true`
- Shows "Sign In" link when `isAuthenticated: false`
- Shows unread notification badge when `notificationStore.unreadCount > 0`
- Hamburger button is visible on mobile viewport (use `vi.mock` or jsdom window.innerWidth)

**ThemePicker.test.tsx**:
- Renders 5 theme swatches
- Clicking a swatch calls `settingsStore.setBoardTheme(theme)`
- Currently selected theme has active visual indicator (aria-pressed or data-active)

**SoundToggle.test.tsx**:
- Clicking mute button calls `Howler.mute(true)` and updates store
- Clicking unmute calls `Howler.mute(false)`
- Button aria-label reflects current mute state ("Mute sounds" / "Unmute sounds")

**useSound.test.ts**:
- `play('move')` calls the Howl.play() method for move sound
- `play('capture')` calls capture Howl
- When `soundMuted` is true, `Howler.mute(true)` is called on mount

### 4. Playwright E2E tests

**e2e/dark-mode.spec.ts**:
- Toggle dark mode from settings → `html` element gets `dark` class
- Reload page → `dark` class persists (from localStorage)
- No light-mode flash: load page with dark mode in localStorage → `dark` class present from first paint

**e2e/theme-persistence.spec.ts**:
- Select "blue" theme in settings → navigate away → return to game → board has blue colors
- Reload page → board still has blue theme (localStorage persisted)

**e2e/keyboard-shortcuts.spec.ts**:
- On `/analysis/:gameId`: ArrowRight advances board position
- ArrowLeft goes back
- Home goes to start position
- End goes to final position
- Escape closes an open modal

**e2e/mobile-nav.spec.ts** (using iPhone 13 viewport):
- Hamburger button visible on mobile
- Click hamburger → nav drawer slides in and is visible
- Click overlay backdrop → drawer closes
- Navigate to a route → drawer closes automatically

**e2e/sound-toggle.spec.ts**:
- Click mute button → button changes to unmute state
- Reload → mute state persists from localStorage

## msw handlers to set up

```typescript
// All routes your tests hit:
GET /users/me
GET /users/:id
GET /games?userId=*
GET /games/:id
GET /leaderboard
GET /puzzles/daily
GET /puzzles/:id
GET /tournaments
GET /tournaments/:id
GET /tournaments/:id/standings
GET /social/friends
GET /social/requests
GET /notifications
POST /social/requests/:id/accept
POST /social/requests/:id/decline
POST /auth/logout
```

## Additional instructions

- Use `vi.spyOn(Howler, 'mute')` to test sound muting without actual audio
- Use `vi.mock('howler')` to mock the entire Howler module in unit tests
- For localStorage tests, use the jsdom built-in (no need for separate mock)
- Every test file must import and use the Vitest globals: `describe`, `test`, `expect`, `beforeEach`, `afterEach`, `vi`
- All test files should have the necessary import for the store they're testing
- Place test setup in `frontend/src/test/setup.ts` and reference it in `vitest.config.ts`
- Mock `window.location.href` assignment for logout redirect tests
- Use `waitFor` from RTL for all async assertions in hook tests

Write complete, runnable TypeScript code for every test file. Do not use pseudocode or placeholders.
