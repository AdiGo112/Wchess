# Feature 12 — Frontend UI: Comprehensive Frontend Implementation Prompt

Copy and paste this entire prompt into a fresh AI session. It is fully self-contained and covers all 6 increments in sequence.

---

You are implementing the Frontend UI polish layer for ChessWeb, a React 18 + TypeScript chess platform (NestJS backend). This prompt covers all six increments: Zustand stores, React Query hooks, sound effects, board themes + piece sets, dark mode + layout polish, and mobile layout + accessibility. Implement them in order — each increment builds on the previous.

## Project Layout

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── public/
│   ├── sounds/         ← move.mp3, capture.mp3, check.mp3, game-end.mp3, illegal.mp3
│   └── pieces/
│       ├── standard/   ← wP.svg, bP.svg, wN.svg, bN.svg, wB.svg, bB.svg, wR.svg, bR.svg, wQ.svg, bQ.svg, wK.svg, bK.svg
│       ├── neo/
│       ├── cburnett/
│       └── alpha/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── types/
    ├── stores/
    ├── lib/
    ├── hooks/
    │   ├── api/
    │   └── useSound.ts
    ├── components/
    │   ├── ui/         ← shared UI primitives
    │   └── layout/
    └── pages/
```

Packages already installed: `react@18`, `react-dom@18`, `typescript`, `vite`, `tailwindcss`, `zustand@4`, `@tanstack/react-query@5`, `react-chessboard`, `chess.js`, `react-router-dom@6`, `axios`.

Install as needed: `npm install howler @types/howler react-hot-toast react-error-boundary`.

---

## Increment 1 — Zustand Stores

### File: `frontend/src/types/settings.ts`

```typescript
export type BoardTheme = 'classic' | 'green' | 'brown' | 'blue' | 'tournament';
export type PieceSet = 'standard' | 'neo' | 'cburnett' | 'alpha';
export type SoundEvent = 'move' | 'capture' | 'check' | 'game-end' | 'illegal';

export interface BoardThemeColors { light: string; dark: string; }

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
```

### File: `frontend/src/stores/authStore.ts`

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
      setAuth: (user, token) => set({ user, accessToken: token, isAuthenticated: true }),
      setAccessToken: (token) => set({ accessToken: token }),
      clearAuth: () => set({ accessToken: null, isAuthenticated: false, user: null }),
    }),
    {
      name: 'chessweb-auth',
      partialize: (state) => ({ user: state.user }), // Never persist token
    }
  )
);
```

### File: `frontend/src/stores/gameStore.ts`

```typescript
import { create } from 'zustand';

export type GameStatus = 'idle' | 'active' | 'ended';
export type PlayerColor = 'white' | 'black';

export interface Clocks { white: number; black: number; } // milliseconds

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

const defaults = {
  gameId: null, fen: DEFAULT_FEN, turn: 'white' as PlayerColor,
  clocks: { white: 600_000, black: 600_000 }, status: 'idle' as GameStatus,
  myColor: null, moves: [], drawOffered: false, opponentId: null,
};

export const useGameStore = create<GameState>()((set) => ({
  ...defaults,
  setState: (partial) => set((s) => ({ ...s, ...partial })),
  reset: () => set({ ...defaults }),
}));
```

### File: `frontend/src/stores/matchmakingStore.ts`

```typescript
import { create } from 'zustand';

export type MatchmakingStatus = 'idle' | 'searching' | 'found';
export type TimeControlVariant = 'bullet' | 'blitz' | 'rapid' | 'classical';
export interface TimeControl { minutes: number; increment: number; }

interface MatchmakingState {
  status: MatchmakingStatus;
  queuedAt: number | null;
  variant: TimeControlVariant;
  timeControl: TimeControl;
  matchedGameId: string | null;
  startSearch: (variant: TimeControlVariant, tc: TimeControl) => void;
  matchFound: (gameId: string) => void;
  reset: () => void;
}

export const useMatchmakingStore = create<MatchmakingState>()((set) => ({
  status: 'idle', queuedAt: null, variant: 'blitz',
  timeControl: { minutes: 5, increment: 3 }, matchedGameId: null,
  startSearch: (variant, timeControl) =>
    set({ status: 'searching', queuedAt: Date.now(), variant, timeControl, matchedGameId: null }),
  matchFound: (gameId) => set({ status: 'found', matchedGameId: gameId }),
  reset: () => set({ status: 'idle', queuedAt: null, matchedGameId: null }),
}));
```

### File: `frontend/src/stores/notificationStore.ts`

```typescript
import { create } from 'zustand';

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  unreadCount: 0,
  notifications: [],
  addNotification: (n) => set((s) => ({
    notifications: [n, ...s.notifications].slice(0, 20),
    unreadCount: n.read ? s.unreadCount : s.unreadCount + 1,
  })),
  markRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    unreadCount: Math.max(0, s.unreadCount - 1),
  })),
  markAllRead: () => set((s) => ({
    notifications: s.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
  })),
  setUnreadCount: (count) => set({ unreadCount: count }),
}));
```

### File: `frontend/src/stores/socialStore.ts`

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
  setFriendOnline: (userId) => set((s) => ({ friendPresence: { ...s.friendPresence, [userId]: true } })),
  setFriendOffline: (userId) => set((s) => ({ friendPresence: { ...s.friendPresence, [userId]: false } })),
  setPendingRequestCount: (count) => set({ pendingRequestCount: count }),
}));
```

### File: `frontend/src/stores/settingsStore.ts`

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
      boardTheme: 'green', pieceSet: 'standard', soundMuted: false, darkMode: false,
      setBoardTheme: (boardTheme) => set({ boardTheme }),
      setPieceSet: (pieceSet) => set({ pieceSet }),
      setSoundMuted: (soundMuted) => set({ soundMuted }),
      toggleDarkMode: () => set((s) => {
        const next = !s.darkMode;
        document.documentElement.classList.toggle('dark', next);
        return { darkMode: next };
      }),
    }),
    { name: 'chessweb-settings' }
  )
);
```

### File: `frontend/src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60 * 1000, retry: 2, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});
```

### File: `frontend/src/lib/queryKeys.ts`

```typescript
export const queryKeys = {
  user: { me: () => ['user', 'me'] as const, byId: (id: string) => ['user', id] as const },
  games: { byUser: (id: string) => ['games', id] as const, byId: (id: string) => ['game', id] as const },
  leaderboard: { all: (v: string, p: string) => ['leaderboard', v, p] as const },
  puzzles: {
    daily: () => ['puzzle', 'daily'] as const,
    list: (f: Record<string, unknown>) => ['puzzles', f] as const,
    byId: (id: string) => ['puzzle', id] as const,
  },
  tournaments: {
    list: (status: string) => ['tournaments', status] as const,
    byId: (id: string) => ['tournament', id] as const,
    standings: (id: string) => ['tournament', id, 'standings'] as const,
  },
  social: {
    friends: (uid: string) => ['friends', uid] as const,
    requests: (uid: string) => ['friendRequests', uid] as const,
  },
  notifications: { list: (uid: string) => ['notifications', uid] as const },
} as const;
```

### Modify: `frontend/index.html`

Add as first child of `<head>` to prevent dark mode flash:

```html
<script>
  (function() {
    try {
      var s = JSON.parse(localStorage.getItem('chessweb-settings') || '{}');
      if (s && s.state && s.state.darkMode) document.documentElement.classList.add('dark');
    } catch(e) {}
  })();
</script>
```

### Modify: `frontend/tailwind.config.js`

```javascript
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chess: {
          'dark-sq': '#769656', 'light-sq': '#eeeed2',
          'app-bg': '#1a1a2e', 'surface': '#16213e',
          'surface-2': '#0f3460', 'accent': '#e94560',
        },
      },
    },
  },
  plugins: [],
};
```

---

## Increment 2 — React Query Hooks

Create `frontend/src/lib/api.ts` (Axios instance with JWT interceptor + 401 refresh):

```typescript
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (t: string) => void; reject: (e: unknown) => void }> = [];

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config;
    if (error.response?.status === 401 && !orig._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then((token) => { orig.headers.Authorization = `Bearer ${token}`; return api(orig); });
      }
      orig._retry = true;
      isRefreshing = true;
      try {
        const { data } = await api.post('/auth/refresh');
        useAuthStore.getState().setAccessToken(data.accessToken);
        failedQueue.forEach((p) => p.resolve(data.accessToken));
        failedQueue = [];
        orig.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(orig);
      } catch (e) {
        failedQueue.forEach((p) => p.reject(e));
        failedQueue = [];
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### File: `frontend/src/hooks/api/useAuth.ts`

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';

export function useMe() {
  return useQuery({
    queryKey: queryKeys.user.me(),
    queryFn: () => api.get('/auth/me').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (dto: { username: string; password: string }) =>
      api.post('/auth/login', dto).then((r) => r.data),
    onSuccess: (data) => setAuth(data.user, data.accessToken),
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => clearAuth(),
  });
}
```

### File: `frontend/src/hooks/api/useGames.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useGameHistory(userId: string, page = 1) {
  return useQuery({
    queryKey: [...queryKeys.games.byUser(userId), page],
    queryFn: () => api.get(`/games/history/${userId}?page=${page}&limit=20`).then((r) => r.data),
    staleTime: 30_000,
    enabled: !!userId,
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: queryKeys.games.byId(gameId),
    queryFn: () => api.get(`/games/${gameId}`).then((r) => r.data),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.status === 'active' ? 5_000 : false,
    enabled: !!gameId,
  });
}
```

### File: `frontend/src/hooks/api/useLeaderboard.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useLeaderboard(variant = 'blitz', period = 'all') {
  return useQuery({
    queryKey: queryKeys.leaderboard.all(variant, period),
    queryFn: () => api.get(`/leaderboard?type=${variant}&period=${period}`).then((r) => r.data),
    staleTime: 30_000,
  });
}
```

### File: `frontend/src/hooks/api/usePuzzles.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useDailyPuzzle() {
  return useQuery({
    queryKey: queryKeys.puzzles.daily(),
    queryFn: () => api.get('/puzzles/daily').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function usePuzzle(id: string) {
  return useQuery({
    queryKey: queryKeys.puzzles.byId(id),
    queryFn: () => api.get(`/puzzles/${id}`).then((r) => r.data),
    staleTime: Infinity,
    enabled: !!id,
  });
}

export function useNextPuzzle() {
  return useQuery({
    queryKey: ['puzzle', 'next'],
    queryFn: () => api.get('/puzzles/next').then((r) => r.data),
    staleTime: 0,
  });
}

export function useSubmitAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { puzzleId: string; solved: boolean; timeTaken: number }) =>
      api.post(`/puzzles/${dto.puzzleId}/attempt`, { solved: dto.solved, timeTaken: dto.timeTaken })
         .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['puzzle', 'next'] }),
  });
}
```

### File: `frontend/src/hooks/api/useTournaments.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useTournaments(status = 'UPCOMING') {
  return useQuery({
    queryKey: queryKeys.tournaments.list(status),
    queryFn: () => api.get(`/tournaments?status=${status}`).then((r) => r.data),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useTournament(id: string) {
  return useQuery({
    queryKey: queryKeys.tournaments.byId(id),
    queryFn: () => api.get(`/tournaments/${id}`).then((r) => r.data),
    staleTime: 5_000,
    refetchInterval: 5_000,
    enabled: !!id,
  });
}

export function useJoinTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/tournaments/${id}/join`).then((r) => r.data),
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: queryKeys.tournaments.byId(id) }),
  });
}
```

---

## Increment 3 — Sound Effects

### File: `frontend/src/hooks/useSound.ts`

```typescript
import { useCallback, useRef } from 'react';
import { Howl } from 'howler';
import { useSettingsStore } from '@/stores/settingsStore';
import { SOUND_FILES, type SoundEvent } from '@/types/settings';

const howlCache = new Map<string, Howl>();

function getHowl(src: string): Howl {
  if (!howlCache.has(src)) {
    howlCache.set(src, new Howl({ src: [src], preload: true, volume: 0.6 }));
  }
  return howlCache.get(src)!;
}

export function useSound() {
  const soundMuted = useSettingsStore((s) => s.soundMuted);

  const play = useCallback((event: SoundEvent) => {
    if (soundMuted) return;
    const src = SOUND_FILES[event];
    if (!src) return;
    const howl = getHowl(src);
    howl.play();
  }, [soundMuted]);

  return { play };
}
```

Usage in components:
```typescript
const { play } = useSound();
// On move: play('move');   On capture: play('capture');
// On check: play('check'); On game end: play('game-end');
// On illegal move attempt: play('illegal');
```

Add a mute toggle button anywhere in the UI:
```typescript
import { useSettingsStore } from '@/stores/settingsStore';

function SoundToggle() {
  const { soundMuted, setSoundMuted } = useSettingsStore();
  return (
    <button onClick={() => setSoundMuted(!soundMuted)} title={soundMuted ? 'Unmute' : 'Mute'}>
      {soundMuted ? '🔇' : '🔊'}
    </button>
  );
}
```

---

## Increment 4 — Board Themes + Piece Sets

### File: `frontend/src/hooks/useBoardConfig.ts`

```typescript
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { BOARD_THEME_COLORS } from '@/types/settings';

export function useBoardConfig() {
  const { boardTheme, pieceSet } = useSettingsStore();

  const customSquareStyles = useMemo(() => {
    const { light, dark } = BOARD_THEME_COLORS[boardTheme];
    return {
      // These override react-chessboard CSS variables
      '--light-sq': light,
      '--dark-sq': dark,
    } as React.CSSProperties;
  }, [boardTheme]);

  const customPieces = useMemo(() => {
    const pieces = ['wP','bP','wN','bN','wB','bB','wR','bR','wQ','bQ','wK','bK'] as const;
    return Object.fromEntries(
      pieces.map((p) => [
        p,
        ({ squareWidth }: { squareWidth: number }) => (
          <img
            src={`/pieces/${pieceSet}/${p}.svg`}
            style={{ width: squareWidth, height: squareWidth }}
            alt={p}
          />
        ),
      ])
    );
  }, [pieceSet]);

  return { customSquareStyles, customPieces };
}
```

### File: `frontend/src/components/settings/BoardAppearancePanel.tsx`

```typescript
import { useSettingsStore } from '@/stores/settingsStore';
import { BOARD_THEME_COLORS, type BoardTheme, type PieceSet } from '@/types/settings';
import { Chessboard } from 'react-chessboard';

const THEMES: BoardTheme[] = ['classic', 'green', 'brown', 'blue', 'tournament'];
const PIECE_SETS: PieceSet[] = ['standard', 'neo', 'cburnett', 'alpha'];

export function BoardAppearancePanel() {
  const { boardTheme, pieceSet, setBoardTheme, setPieceSet } = useSettingsStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Board Theme</h3>
        <div className="flex gap-3 flex-wrap">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setBoardTheme(t)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                boardTheme === t ? 'border-blue-500' : 'border-transparent'
              }`}
            >
              <div className="w-12 h-12 grid grid-cols-2 rounded overflow-hidden">
                <div style={{ background: BOARD_THEME_COLORS[t].light }} />
                <div style={{ background: BOARD_THEME_COLORS[t].dark }} />
                <div style={{ background: BOARD_THEME_COLORS[t].dark }} />
                <div style={{ background: BOARD_THEME_COLORS[t].light }} />
              </div>
              <span className="text-xs capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Piece Set</h3>
        <div className="flex gap-3 flex-wrap">
          {PIECE_SETS.map((s) => (
            <button
              key={s}
              onClick={() => setPieceSet(s)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors ${
                pieceSet === s ? 'border-blue-500' : 'border-transparent'
              }`}
            >
              <img src={`/pieces/${s}/wK.svg`} alt={s} className="w-10 h-10" />
              <span className="text-xs capitalize">{s}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Increment 5 — Dark Mode + Layout Polish

### File: `frontend/src/components/ui/Skeleton.tsx`

```typescript
interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '', lines = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
        />
      ))}
    </>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" lines={3} />
    </div>
  );
}
```

### File: `frontend/src/components/ui/Toast.tsx`

```typescript
import { Toaster } from 'react-hot-toast';

export function ChessToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#1e293b',
          color: '#f1f5f9',
          border: '1px solid #334155',
        },
        success: { iconTheme: { primary: '#22c55e', secondary: '#f1f5f9' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } },
      }}
    />
  );
}
```

Add `<ChessToaster />` to `frontend/src/App.tsx`.

Usage throughout the app:
```typescript
import toast from 'react-hot-toast';
toast.success('Move submitted!');
toast.error('Connection lost');
```

### File: `frontend/src/components/ui/ErrorFallback.tsx`

```typescript
import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8">
      <div className="text-5xl">♟</div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Something went wrong
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
        {error?.message ?? 'An unexpected error occurred.'}
      </p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
```

### Wrap routes with ErrorBoundary in `frontend/src/App.tsx`:

```typescript
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from '@/components/ui/ErrorFallback';
import { ChessToaster } from '@/components/ui/Toast';

// Inside each <Route element=...> that contains a page component:
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>}>
    <YourPageComponent />
  </Suspense>
</ErrorBoundary>
```

### Dark mode classes pattern

Use Tailwind dark variants everywhere:
```
bg-white dark:bg-gray-900
text-gray-900 dark:text-gray-100
border-gray-200 dark:border-gray-700
```

---

## Increment 6 — Mobile Layout + Accessibility

### File: `frontend/src/components/layout/Navbar.tsx`

```typescript
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useNotificationStore } from '@/stores/notificationStore';

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { darkMode, toggleDarkMode } = useSettingsStore();
  const { unreadCount } = useNotificationStore();
  const navigate = useNavigate();

  const navLinks = [
    { to: '/', label: 'Play' },
    { to: '/puzzles', label: 'Puzzles' },
    { to: '/tournaments', label: 'Tournaments' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ];

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="font-bold text-xl text-blue-600 dark:text-blue-400">
            ChessWeb
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to}
                className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => navigate('/notifications')}
                  aria-label={`${unreadCount} unread notifications`}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  🔔
                  {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                <Link to={`/profile/${user?.username}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.username}
                </Link>
              </div>
            ) : (
              <Link to="/login" className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                Sign In
              </Link>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Open navigation menu"
              aria-expanded={mobileOpen}
            >
              <div className="w-5 h-4 flex flex-col justify-between">
                <span className={`block h-0.5 bg-gray-600 dark:bg-gray-300 transition-transform ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
                <span className={`block h-0.5 bg-gray-600 dark:bg-gray-300 transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
                <span className={`block h-0.5 bg-gray-600 dark:bg-gray-300 transition-transform ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex flex-col gap-3">
          {navLinks.map((l) => (
            <Link key={l.to} to={l.to}
              onClick={() => setMobileOpen(false)}
              className="text-sm text-gray-700 dark:text-gray-300 py-1">
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
```

### Keyboard Shortcuts Hook: `frontend/src/hooks/useKeyboardShortcuts.ts`

```typescript
import { useEffect } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't fire in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      for (const s of shortcuts) {
        if (
          e.key === s.key &&
          (s.ctrl === undefined || s.ctrl === e.ctrlKey) &&
          (s.shift === undefined || s.shift === e.shiftKey)
        ) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
```

Usage in AnalysisPage:
```typescript
useKeyboardShortcuts([
  { key: 'ArrowRight', handler: goForward, description: 'Next move' },
  { key: 'ArrowLeft', handler: goBack, description: 'Previous move' },
  { key: 'f', handler: flipBoard, description: 'Flip board' },
  { key: 'Escape', handler: closeModal, description: 'Close modal' },
]);
```

### ARIA + Accessibility — Pattern Rules

Apply these across all interactive components:

```typescript
// All icon buttons must have aria-label
<button aria-label="Close dialog" onClick={onClose}>✕</button>

// Modal/Dialog must have role and aria-modal
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Draw Offered</h2>
  ...
</div>

// Focus trap in modal: first focusable element gets focus on open
useEffect(() => {
  if (isOpen) {
    modalRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
  }
}, [isOpen]);

// Live regions for game events
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {lastMoveAnnouncement}
</div>

// Board: react-chessboard already has role="img" — add aria-label describing the position
<Chessboard ariaLabel={`Chess position: ${fen}. It is ${turn}'s turn.`} ... />
```

### Touch Support for Board

react-chessboard supports touch natively. Ensure `onPieceDrop` is wired and that the board container has no `user-select: none` conflicts:

```typescript
<div className="touch-none select-none"> {/* Prevent text selection on drag */}
  <Chessboard
    position={fen}
    onPieceDrop={onDrop}
    boardOrientation={myColor}
    animationDuration={150}
    customDarkSquareStyle={{ backgroundColor: BOARD_THEME_COLORS[boardTheme].dark }}
    customLightSquareStyle={{ backgroundColor: BOARD_THEME_COLORS[boardTheme].light }}
    customPieces={customPieces}
    ariaLabel={`Chess board. ${turn === myColor ? 'Your turn.' : "Opponent's turn."}`}
  />
</div>
```

---

## Verification (All Increments)

```bash
# 1. Build succeeds
npm run build

# 2. No TypeScript errors
npx tsc --noEmit

# 3. Stores — open browser console on app
JSON.parse(localStorage.getItem('chessweb-auth')).state.accessToken // must be undefined
JSON.parse(localStorage.getItem('chessweb-settings')).state.boardTheme // 'green'

# 4. Dark mode — toggle should persist on reload
# Click dark mode toggle → reload page → dark mode should still be on

# 5. Sound — open a game, make a move → should hear sound (check audio is unmuted)

# 6. Board theme — open Settings → switch theme → board colors change immediately

# 7. Mobile — DevTools responsive mode (375px wide) → hamburger menu appears → tapping opens nav

# 8. Keyboard — on Analysis page → left/right arrows navigate moves, 'f' flips board, ESC closes modal

# 9. Accessibility — run Lighthouse a11y audit → score ≥ 90
```
