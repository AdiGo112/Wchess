# Feature 12 — Frontend UI: API Design (React Query Hooks)

Feature 12 adds no new REST API endpoints. The "API layer" for frontend components is the set of React Query hooks in `frontend/src/hooks/api/`. These hooks encapsulate all data fetching, caching, and mutation logic. Components import hooks and never import `axios` directly.

All hooks live in `frontend/src/hooks/api/`. One file per resource domain.

---

## QueryClient Configuration

**File**: `frontend/src/lib/queryClient.ts`

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

---

## Cache Key Reference

All cache keys used in hooks — must be exact (no variations):

```typescript
// src/lib/queryKeys.ts
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
    list: (filters: object) => ['puzzles', filters] as const,
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

---

## Hook Specifications

### useCurrentUser

**File**: `frontend/src/hooks/api/useUser.ts`

```typescript
// Returns the currently authenticated user's full profile
function useCurrentUser(): UseQueryResult<AuthUser>

// Returns any user's public profile
function useUser(userId: string): UseQueryResult<PublicUserProfile>
```

| Property | Value |
|---|---|
| Cache key | `['user', 'me']` / `['user', userId]` |
| staleTime | 60_000ms |
| refetchInterval | — |
| Endpoint | `GET /users/me` / `GET /users/:id` |
| Enabled condition | `isAuthenticated` must be true |

**Invalidation triggers**:
- Avatar upload mutation → invalidate `['user', 'me']`
- Username update mutation → invalidate `['user', 'me']`

---

### useGames

**File**: `frontend/src/hooks/api/useGames.ts`

```typescript
// User's game history (paginated)
function useGames(userId: string, page?: number): UseQueryResult<PaginatedGames>

// Single game detail (for analysis/review)
function useGame(gameId: string): UseQueryResult<GameDetail>
```

| Property | Value |
|---|---|
| Cache key | `['games', userId]` / `['game', gameId]` |
| staleTime | 30_000ms |
| refetchInterval | — |
| Endpoint | `GET /games?userId={userId}&page={page}` / `GET /games/:id` |

---

### useActiveGame

**File**: `frontend/src/hooks/api/useGames.ts` (same file, separate export)

```typescript
// Polls the active game — fallback if WebSocket connection drops
function useActiveGame(gameId: string, enabled: boolean): UseQueryResult<ActiveGameState>
```

| Property | Value |
|---|---|
| Cache key | `['game', gameId]` |
| staleTime | 0ms |
| refetchInterval | 5_000ms (only when `enabled` is true) |
| Endpoint | `GET /games/:id` |
| Note | `enabled` should be `gameStore.status === 'active'` |

---

### useLeaderboard

**File**: `frontend/src/hooks/api/useLeaderboard.ts`

```typescript
function useLeaderboard(
  variant: 'standard' | 'bullet' | 'blitz' | 'rapid',
  timeControl?: string,
  page?: number
): UseQueryResult<LeaderboardPage>
```

| Property | Value |
|---|---|
| Cache key | `['leaderboard', variant, timeControl ?? 'all']` |
| staleTime | 30_000ms |
| refetchInterval | — |
| Endpoint | `GET /leaderboard?variant={variant}&timeControl={tc}&page={page}` |

---

### usePuzzle / usePuzzles

**File**: `frontend/src/hooks/api/usePuzzles.ts`

```typescript
// Today's daily puzzle
function useDailyPuzzle(): UseQueryResult<Puzzle>

// Puzzle list with filtering
function usePuzzles(filters: PuzzleFilters): UseQueryResult<Puzzle[]>

// Single puzzle by ID
function usePuzzle(puzzleId: string): UseQueryResult<Puzzle>

// Submit puzzle solution
function useSubmitPuzzle(): UseMutationResult<PuzzleResult, unknown, PuzzleSolution>
```

| Property | Value |
|---|---|
| Cache key | `['puzzle', 'daily']` / `['puzzles', filters]` / `['puzzle', puzzleId]` |
| staleTime | Infinity |
| refetchInterval | — |
| Endpoint | `GET /puzzles/daily` / `GET /puzzles` / `GET /puzzles/:id` |

`staleTime: Infinity` means puzzle content is fetched once and never re-fetched in background. The `useSubmitPuzzle` mutation must invalidate `['puzzle', puzzleId]` on success to reload the solved state.

---

### useTournaments

**File**: `frontend/src/hooks/api/useTournaments.ts`

```typescript
// List tournaments by status
function useTournaments(
  status: 'upcoming' | 'active' | 'completed'
): UseQueryResult<Tournament[]>

// Single tournament detail
function useTournament(tournamentId: string): UseQueryResult<TournamentDetail>

// Tournament standings (frequently updated during active round)
function useTournamentStandings(tournamentId: string): UseQueryResult<Standing[]>

// Join a tournament
function useJoinTournament(): UseMutationResult<void, unknown, string>

// Leave a tournament
function useLeaveTournament(): UseMutationResult<void, unknown, string>
```

| Property | Value |
|---|---|
| Cache key | `['tournaments', status]` / `['tournament', id]` / `['tournament', id, 'standings']` |
| staleTime | 5_000ms |
| refetchInterval | 5_000ms (for standings during active tournament only) |
| Endpoint | `GET /tournaments` / `GET /tournaments/:id` / `GET /tournaments/:id/standings` |

**Invalidation triggers**:
- `useJoinTournament` success → invalidate `['tournament', id]`, `['tournaments', 'upcoming']`
- `useLeaveTournament` success → same

---

### useFriends

**File**: `frontend/src/hooks/api/useSocial.ts`

```typescript
// Friends list
function useFriends(userId: string): UseQueryResult<Friend[]>

// Pending friend requests
function useFriendRequests(userId: string): UseQueryResult<FriendRequest[]>

// Send friend request
function useSendFriendRequest(): UseMutationResult<void, unknown, string>

// Accept friend request
function useAcceptFriendRequest(): UseMutationResult<void, unknown, string>

// Decline friend request
function useDeclineFriendRequest(): UseMutationResult<void, unknown, string>

// Remove friend
function useRemoveFriend(): UseMutationResult<void, unknown, string>
```

| Property | Value |
|---|---|
| Cache key | `['friends', userId]` / `['friendRequests', userId]` |
| staleTime | 30_000ms |
| Endpoint | `GET /social/friends` / `GET /social/requests` |

**Invalidation triggers**:
- `useAcceptFriendRequest` success → invalidate `['friends', userId]`, `['friendRequests', userId]`
- `useDeclineFriendRequest` success → invalidate `['friendRequests', userId]`
- `useRemoveFriend` success → invalidate `['friends', userId]`

---

### useNotifications

**File**: `frontend/src/hooks/api/useNotifications.ts`

```typescript
// Notification history (fetched when drawer opens)
function useNotifications(userId: string): UseQueryResult<Notification[]>

// Mark notification as read
function useMarkNotificationRead(): UseMutationResult<void, unknown, string>

// Mark all as read
function useMarkAllNotificationsRead(): UseMutationResult<void, unknown, void>
```

| Property | Value |
|---|---|
| Cache key | `['notifications', userId]` |
| staleTime | 0ms |
| refetchInterval | — |
| Endpoint | `GET /notifications` |
| Note | `enabled` tied to notification drawer open state |

---

## Optimistic Update Pattern

For mutations that benefit from immediate UI feedback (friend accept, mark-read):

```typescript
// Pattern for useAcceptFriendRequest
const mutation = useMutation({
  mutationFn: (requestId: string) => api.post(`/social/requests/${requestId}/accept`),
  onMutate: async (requestId) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['friendRequests', userId] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['friendRequests', userId]);

    // Optimistic update: remove from pending list
    queryClient.setQueryData(['friendRequests', userId], (old: FriendRequest[]) =>
      old.filter(r => r.id !== requestId)
    );

    return { previous };
  },
  onError: (_err, _requestId, context) => {
    // Rollback on error
    queryClient.setQueryData(['friendRequests', userId], context?.previous);
  },
  onSettled: () => {
    // Always refetch to sync with server
    queryClient.invalidateQueries({ queryKey: ['friendRequests', userId] });
    queryClient.invalidateQueries({ queryKey: ['friends', userId] });
  },
});
```

---

## Auth Mutations (not in hooks/api — in features/auth)

```typescript
// Login
function useLogin(): UseMutationResult<AuthResponse, unknown, LoginCredentials>
// POST /auth/login → setAuth(user, token) → navigate to /

// Register
function useRegister(): UseMutationResult<AuthResponse, unknown, RegisterCredentials>
// POST /auth/register → setAuth(user, token) → navigate to /

// Logout
function useLogout(): UseMutationResult<void, unknown, void>
// POST /auth/logout → clearAuth() → queryClient.clear() → navigate to /login
```
