# 12-Frontend UI — Architecture

## 1. State Management Split

### Server State (TanStack Query)

All data that originates from the API is owned by TanStack Query. This means it is fetched, cached, background-refreshed, and invalidated by the Query client — not by Zustand.

```
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // 30s default — most lists
      gcTime: 5 * 60 * 1000,     // 5m garbage collection
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
```

Per-query overrides:
- Active game polling: `staleTime: 0, refetchInterval: 5000` (only while game status is 'active')
- Active tournament: `staleTime: 5000, refetchInterval: 5000`
- Puzzle data: `staleTime: Infinity` — puzzle content is static until explicitly invalidated
- User profile: `staleTime: 60_000`
- Leaderboard: `staleTime: 30_000`, no refetchInterval (user triggers manually)

### Client State (Zustand)

Zustand owns state that does not have a canonical server representation, or state that must be updated faster than API polling allows:

| Store | What it holds |
|---|---|
| `authStore` | `accessToken`, `user` (id, username, email, avatar), `isAuthenticated` flag |
| `gameStore` | `gameId`, `fen`, `turn`, `clocks`, `status`, `myColor`, `moves[]`, `drawOffered`, `opponentId` |
| `matchmakingStore` | `status` ('idle'/'searching'/'found'), `queuedAt`, `variant`, `timeControl` |
| `notificationStore` | `unreadCount`, `notifications[]` (recent 20) |
| `socialStore` | `friendPresence` (Record<userId, boolean>), `pendingRequestCount` |

Zustand stores update synchronously from socket events — no round-trip to server needed.

### No Duplication Rule

If TanStack Query already caches a piece of data (e.g., the user's game history), that data must NOT be duplicated into Zustand. Components read from Query cache; Zustand only holds state that has no Query equivalent.

---

## 2. Socket.io Integration

### Singleton Factory

```
// src/lib/socket.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

const socketCache = new Map<string, Socket>();

export function getSocket(namespace: string): Socket {
  if (socketCache.has(namespace)) {
    return socketCache.get(namespace)!;
  }
  const token = useAuthStore.getState().accessToken;
  const socket = io(`${import.meta.env.VITE_API_URL}${namespace}`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: false,
  });
  socketCache.set(namespace, socket);
  return socket;
}

export function disconnectSocket(namespace: string): void {
  const socket = socketCache.get(namespace);
  if (socket) {
    socket.disconnect();
    socketCache.delete(namespace);
  }
}
```

### Feature Hook Pattern

Each feature that needs real-time data implements a hook that:
1. Calls `getSocket(namespace)` in the hook body (outside useEffect)
2. Calls `socket.connect()` in a `useEffect` with empty deps
3. Registers event listeners inside the same `useEffect`
4. Returns the cleanup: `socket.off(...)` + `socket.disconnect()`

```
// example: src/features/game/hooks/useGameSocket.ts
export function useGameSocket(gameId: string) {
  const socket = getSocket('/game');
  const setGameState = useGameStore(s => s.setState);

  useEffect(() => {
    socket.connect();
    socket.emit('join_game', { gameId });

    socket.on('move_made', (data) => {
      setGameState({ fen: data.fen, turn: data.turn, moves: data.moves });
    });
    socket.on('clock_tick', (data) => {
      setGameState({ clocks: data.clocks });
    });
    socket.on('game_over', (data) => {
      setGameState({ status: data.status });
    });

    return () => {
      socket.off('move_made');
      socket.off('clock_tick');
      socket.off('game_over');
      socket.emit('leave_game', { gameId });
      socket.disconnect();
    };
  }, [gameId]);
}
```

### Namespaces Used

| Namespace | Feature | Events |
|---|---|---|
| `/game` | GamePage | join_game, move_made, clock_tick, game_over, draw_offered, draw_accepted |
| `/matchmaking` | PlayPage | join_queue, leave_queue, match_found, queue_position |
| `/notifications` | Global (NavBar) | notification, mark_read |
| `/social` | FriendsPage | friend_online, friend_offline, friend_request |
| `/chat` | GamePage sidebar | message, typing |
| `/tournament` | TournamentDetailPage | round_started, game_completed, standings_updated |

---

## 3. Auth Flow

### App Boot Sequence

```
1. index.html loads → Vite bundle → ReactDOM.createRoot
2. App.tsx wraps children in <QueryClientProvider> + <RouterProvider>
3. AuthProvider (context wrapper) fires on mount:
   GET /auth/me  (browser sends httpOnly refresh cookie automatically)
4a. 200 OK → { user, accessToken } → authStore.setAuth(user, accessToken)
4b. 401 Unauthorized → authStore remains empty → router shows /login
5. React Router renders the matched route component
```

### Protected Route Redirect

```
// src/router/ProtectedRoute.tsx
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
```

After login, `LoginPage` reads `location.state.from` and navigates back to the original route.

### Token Storage

- Access token: Zustand store, in-memory only — cleared on page refresh (intentional; re-acquired via refresh cookie on next boot)
- Refresh token: httpOnly cookie, set by `POST /auth/login` and `POST /auth/refresh`
- Username + avatar: Zustand `persist` middleware writing to `localStorage` (non-sensitive, used to pre-render NavBar before /auth/me resolves)

---

## 4. Axios Interceptors

### Request Interceptor — Attach Bearer Token

```
// src/lib/api.ts (request interceptor)
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### Response Interceptor — Refresh on 401

The interceptor uses a queue pattern to avoid multiple simultaneous refresh calls:

```
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post('/auth/refresh');  // cookie sent automatically
        const newToken = data.accessToken;
        useAuthStore.getState().setAccessToken(newToken);
        failedQueue.forEach(p => p.resolve(newToken));
        failedQueue = [];
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        failedQueue.forEach(p => p.reject(refreshError));
        failedQueue = [];
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

---

## 5. Code Splitting

Every feature's `index.tsx` is imported via `React.lazy()` in the router. Vite automatically emits a separate chunk per dynamic import.

```
// src/router/index.tsx (excerpt)
const GamePage           = lazy(() => import('@/features/game'));
const PuzzlePage         = lazy(() => import('@/features/puzzles/PuzzlePage'));
const TournamentListPage = lazy(() => import('@/features/tournaments'));
const AnalysisPage       = lazy(() => import('@/features/analysis'));

// All routes wrapped in:
<Suspense fallback={<PageLoadingSpinner />}>
  <Routes>
    <Route path="/game/:id" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
    ...
  </Routes>
</Suspense>
```

### Bundle Size Targets

| Chunk | Approximate gzipped size | Heavy dependencies |
|---|---|---|
| Initial (auth + shell) | ~80kb | react, react-dom, react-router |
| game | ~120kb | chess.js, react-chessboard |
| puzzles | ~80kb | chess.js (shared), socket.io-client |
| analysis | ~90kb | chess.js, evaluation math |
| matchmaking | ~30kb | socket.io-client (shared) |
| tournaments | ~35kb | — |
| leaderboard | ~20kb | — |
| social | ~25kb | — |

Vite's `build.rollupOptions.output.manualChunks` controls vendor splitting to ensure `chess.js` and `socket.io-client` are shared vendor chunks rather than duplicated.

---

## 6. Environment Variables

All `VITE_` prefixed env vars are inlined at build time:

```
VITE_API_URL=http://localhost:3000     # NestJS backend base URL
VITE_WS_URL=ws://localhost:3000        # Socket.io URL (same origin in prod)
VITE_APP_ENV=development               # development | staging | production
```

Production values are set in the CI/CD pipeline; `.env.local` is git-ignored.

---

## 7. Error Boundaries

Each feature route is wrapped in a feature-specific `ErrorBoundary` that:
- Displays a chess-themed error card with a retry button
- Reports the error to the error tracking service (Sentry in production)
- Does not crash the entire app — only the failed feature section

```
// src/router/index.tsx (pattern)
<Route
  path="/game/:id"
  element={
    <ProtectedRoute>
      <ErrorBoundary FallbackComponent={GameErrorFallback}>
        <Suspense fallback={<PageLoadingSpinner />}>
          <GamePage />
        </Suspense>
      </ErrorBoundary>
    </ProtectedRoute>
  }
/>
```
