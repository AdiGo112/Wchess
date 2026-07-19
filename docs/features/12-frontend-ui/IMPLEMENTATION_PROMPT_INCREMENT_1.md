# Feature 12 — Frontend UI: Implementation Prompt — Increment 1 (Zustand Stores)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

You are implementing the Zustand state management layer for ChessWeb, a React 18 + TypeScript chess platform. Create all six Zustand stores, the QueryClient configuration, the query key factories, and supporting type definitions. Also update `index.html` and `tailwind.config.js` for dark mode support.

## Context

- Project: ChessWeb — NestJS backend + React frontend targeting 11M+ users
- Frontend directory: `frontend/`
- All stores go in: `frontend/src/stores/`
- Tech: React 18, TypeScript, Zustand 4, Vite, Tailwind CSS
- Zustand is already installed. If not: `npm install zustand`
- `@tanstack/react-query@5` is already installed. If not: `npm install @tanstack/react-query`

## Files to Create

### 1. `frontend/src/types/settings.ts`

```typescript
// Board theme + piece set types and constants
export type BoardTheme = 'classic' | 'green' | 'brown' | 'blue' | 'tournament';
export type PieceSet = 'standard' | 'neo' | 'cburnett' | 'alpha';
export type SoundEvent = 'move' | 'capture' | 'check' | 'game-end' | 'illegal';

export interface BoardThemeColors {
  light: string;
  dark: string;
}

export const BOARD_THEME_COLORS: Record<BoardTheme, BoardThemeColors> = {
  classic:    { light: '#f0d9b5', dark: '#b58863' },
  green:      { light: '#eeeed2', dark: '#769656' },
  brown:      { light: '#f0d9b5', dark: '#b58863' },
  blue:       { light: '#dee3e6', dark: '#8ca2ad' },
  tournament: { light: '#ffffff', dark: '#4a4a4a' },
};

export const SOUND_FILES: Record<SoundEvent, string> = {
  'move':     '/sounds/move.mp3',
  'capture':  '/sounds/capture.mp3',
  'check':    '/sounds/check.mp3',
  'game-end': '/sounds/game-end.mp3',
  'illegal':  '/sounds/illegal.mp3',
};

export const PIECE_SET_BASE_PATH = '/pieces';

export function getPieceSetPath(set: PieceSet, piece: string): string {
  return `${PIECE_SET_BASE_PATH}/${set}/${piece}.svg`;
}
```

### 2. `frontend/src/stores/authStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  rating: number;
}

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  user: AuthUser | null;
  setAuth: (user: AuthUser, token: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      isAuthenticated: false,
      user: null,

      setAuth: (user, token) =>
        set({ user, accessToken: token, isAuthenticated: true }),

      setAccessToken: (token) =>
        set({ accessToken: token }),

      clearAuth: () =>
        set({ accessToken: null, isAuthenticated: false, user: null }),
    }),
    {
      name: 'chessweb-auth',
      // CRITICAL: never persist the access token or isAuthenticated flag
      // isAuthenticated is re-derived from GET /auth/me on every boot
      // accessToken is in-memory only to prevent XSS token theft
      partialize: (state) => ({ user: state.user }),
    }
  )
);
```

### 3. `frontend/src/stores/gameStore.ts`

```typescript
import { create } from 'zustand';

export type GameStatus = 'idle' | 'active' | 'ended';
export type PlayerColor = 'white' | 'black';

export interface Clocks {
  white: number; // milliseconds remaining
  black: number;
}

interface GameState {
  gameId: string | null;
  fen: string;
  turn: PlayerColor;
  clocks: Clocks;
  status: GameStatus;
  myColor: PlayerColor | null;
  moves: string[];
  drawOffered: boolean;
  opponentId: string | null;
  setState: (partial: Partial<Omit<GameState, 'setState' | 'reset'>>) => void;
  reset: () => void;
}

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const defaultGameState = {
  gameId: null,
  fen: DEFAULT_FEN,
  turn: 'white' as PlayerColor,
  clocks: { white: 600_000, black: 600_000 },
  status: 'idle' as GameStatus,
  myColor: null,
  moves: [],
  drawOffered: false,
  opponentId: null,
};

export const useGameStore = create<GameState>()((set) => ({
  ...defaultGameState,

  setState: (partial) => set((state) => ({ ...state, ...partial })),

  reset: () => set({ ...defaultGameState }),
}));
```

### 4. `frontend/src/stores/matchmakingStore.ts`

```typescript
import { create } from 'zustand';

export type MatchmakingStatus = 'idle' | 'searching' | 'found';
export type TimeControlVariant = 'bullet' | 'blitz' | 'rapid' | 'classical';

export interface TimeControl {
  minutes: number;
  increment: number;
}

interface MatchmakingState {
  status: MatchmakingStatus;
  queuedAt: number | null;
  variant: TimeControlVariant;
  timeControl: TimeControl;
  matchedGameId: string | null;
  startSearch: (variant: TimeControlVariant, timeControl: TimeControl) => void;
  matchFound: (gameId: string) => void;
  reset: () => void;
}

export const useMatchmakingStore = create<MatchmakingState>()((set) => ({
  status: 'idle',
  queuedAt: null,
  variant: 'blitz',
  timeControl: { minutes: 5, increment: 3 },
  matchedGameId: null,

  startSearch: (variant, timeControl) =>
    set({ status: 'searching', queuedAt: Date.now(), variant, timeControl, matchedGameId: null }),

  matchFound: (gameId) =>
    set({ status: 'found', matchedGameId: gameId }),

  reset: () =>
    set({ status: 'idle', queuedAt: null, matchedGameId: null }),
}));
```

### 5. `frontend/src/stores/notificationStore.ts`

```typescript
import { create } from 'zustand';

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'game_invite'
  | 'tournament_start'
  | 'game_result';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadCount: 0,
  notifications: [],

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 20),
      unreadCount: notification.read ? state.unreadCount : state.unreadCount + 1,
    })),

  markRead: (notificationId) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  setUnreadCount: (count) => set({ unreadCount: count }),
}));
```

### 6. `frontend/src/stores/socialStore.ts`

```typescript
import { create } from 'zustand';

interface SocialState {
  friendPresence: Record<string, boolean>;
  pendingRequestCount: number;
  setFriendOnline: (userId: string) => void;
  setFriendOffline: (userId: string) => void;
  setPendingRequestCount: (count: number) => void;
}

export const useSocialStore = create<SocialState>()((set) => ({
  friendPresence: {},
  pendingRequestCount: 0,

  setFriendOnline: (userId) =>
    set((state) => ({
      friendPresence: { ...state.friendPresence, [userId]: true },
    })),

  setFriendOffline: (userId) =>
    set((state) => ({
      friendPresence: { ...state.friendPresence, [userId]: false },
    })),

  setPendingRequestCount: (count) =>
    set({ pendingRequestCount: count }),
}));
```

### 7. `frontend/src/stores/settingsStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardTheme, PieceSet } from '@/types/settings';

interface SettingsState {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundMuted: boolean;
  darkMode: boolean;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceSet: (set: PieceSet) => void;
  setSoundMuted: (muted: boolean) => void;
  toggleDarkMode: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      boardTheme: 'green',
      pieceSet: 'standard',
      soundMuted: false,
      darkMode: false,

      setBoardTheme: (theme) => set({ boardTheme: theme }),

      setPieceSet: (pieceSet) => set({ pieceSet }),

      setSoundMuted: (muted) => set({ soundMuted: muted }),

      toggleDarkMode: () =>
        set((state) => {
          const newValue = !state.darkMode;
          // Side effect: update the DOM class directly
          if (newValue) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { darkMode: newValue };
        }),
    }),
    {
      name: 'chessweb-settings',
      // All settings fields are persisted
    }
  )
);
```

### 8. `frontend/src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30 seconds default
      gcTime: 5 * 60 * 1000,     // 5 minutes garbage collection
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

### 9. `frontend/src/lib/queryKeys.ts`

```typescript
export const queryKeys = {
  user: {
    me: () => ['user', 'me'] as const,
    byId: (id: string) => ['user', id] as const,
  },
  games: {
    byUser: (userId: string) => ['games', userId] as const,
    byId: (gameId: string) => ['game', gameId] as const,
  },
  leaderboard: {
    all: (variant: string, tc: string) => ['leaderboard', variant, tc] as const,
  },
  puzzles: {
    daily: () => ['puzzle', 'daily'] as const,
    list: (filters: Record<string, unknown>) => ['puzzles', filters] as const,
    byId: (id: string) => ['puzzle', id] as const,
  },
  tournaments: {
    list: (status: string) => ['tournaments', status] as const,
    byId: (id: string) => ['tournament', id] as const,
    standings: (id: string) => ['tournament', id, 'standings'] as const,
  },
  social: {
    friends: (userId: string) => ['friends', userId] as const,
    requests: (userId: string) => ['friendRequests', userId] as const,
  },
  notifications: {
    list: (userId: string) => ['notifications', userId] as const,
  },
} as const;
```

## Files to Modify

### 10. `frontend/index.html`

Add this script inside `<head>`, as the **first** child (before any link or script tags):

```html
<script>
  (function() {
    try {
      var s = JSON.parse(localStorage.getItem('chessweb-settings') || '{}');
      if (s && s.state && s.state.darkMode === true) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
</script>
```

### 11. `frontend/tailwind.config.js`

Add `darkMode: 'class'` at the top level of the config object:

```javascript
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chess: {
          'dark-square':  '#769656',
          'light-square': '#eeeed2',
          'app-bg':       '#1a1a2e',
          'surface':      '#16213e',
          'surface-2':    '#0f3460',
          'accent':       '#e94560',
        },
      },
    },
  },
  plugins: [],
};
```

## Verification

After creating all files, verify by running this in the browser console (on the app):

```javascript
// Should show { user: null } (no accessToken)
JSON.parse(localStorage.getItem('chessweb-auth'))

// Should show { boardTheme: 'green', pieceSet: 'standard', soundMuted: false, darkMode: false }
JSON.parse(localStorage.getItem('chessweb-settings')).state
```

And in a test file:
```typescript
import { useAuthStore } from '@/stores/authStore';

// Test that accessToken is not persisted
useAuthStore.getState().setAuth({ id: '1', username: 'test', email: 'a@b.com', avatarUrl: null, rating: 1200 }, 'secret-token');
const stored = JSON.parse(localStorage.getItem('chessweb-auth') ?? '{}');
console.assert(stored.state?.accessToken === undefined, 'accessToken MUST NOT be in localStorage');
console.assert(stored.state?.user?.username === 'test', 'user MUST be in localStorage');
```

## Additional Notes

- Do not add `isAuthenticated` to the persist partialize — it is always derived from `GET /auth/me`
- The `gameStore` default FEN is the starting position: `'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'`
- The `settingsStore.toggleDarkMode()` has a DOM side effect (`document.documentElement.classList`) — this is intentional, not a mistake
- All stores should be importable as: `import { useAuthStore } from '@/stores/authStore'` (using the `@` path alias for `src/`)
- The `@` path alias should already be configured in `vite.config.ts` and `tsconfig.json`
