# Feature 12 — Frontend UI: Implementation Prompt — Increment 2 (React Query Hooks)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

You are implementing all React Query data-fetching hooks for ChessWeb. These hooks are the "API layer" for components — components import these hooks and never use axios directly. Also wire `QueryClientProvider` into `App.tsx` and add the login/register/logout auth mutations.

## Prerequisites (already exist)

- `frontend/src/lib/api.ts` — Axios instance with interceptors
- `frontend/src/lib/queryClient.ts` — QueryClient with defaults
- `frontend/src/lib/queryKeys.ts` — Cache key factories
- `frontend/src/stores/authStore.ts` — authStore with clearAuth()
- `@tanstack/react-query@5` installed

## Type Definitions

First create `frontend/src/types/api.ts` with response shapes:

```typescript
// frontend/src/types/api.ts

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  rating: number;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface GameSummary {
  id: string;
  whitePlayer: { id: string; username: string; rating: number };
  blackPlayer: { id: string; username: string; rating: number };
  result: 'white' | 'black' | 'draw' | null;
  variant: string;
  timeControl: { minutes: number; increment: number };
  moves: number;
  playedAt: string;
}

export interface GameDetail extends GameSummary {
  pgn: string;
  fen: string;
  moveHistory: string[];
}

export interface ActiveGameState {
  id: string;
  fen: string;
  turn: 'white' | 'black';
  clocks: { white: number; black: number };
  status: 'active' | 'ended';
  moves: string[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
  wins: number;
}

export interface LeaderboardPage {
  entries: LeaderboardEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Puzzle {
  id: string;
  fen: string;
  solution: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  rating: number;
  themes: string[];
  solved?: boolean;
}

export interface PuzzleFilters {
  difficulty?: 'easy' | 'medium' | 'hard';
  theme?: string;
  page?: number;
}

export interface PuzzleSolution {
  puzzleId: string;
  moves: string[];
  timeMs: number;
}

export interface PuzzleResult {
  correct: boolean;
  ratingChange: number;
  newRating: number;
}

export interface Tournament {
  id: string;
  name: string;
  status: 'upcoming' | 'active' | 'completed';
  startTime: string;
  timeControl: { minutes: number; increment: number };
  variant: string;
  maxPlayers: number;
  currentPlayers: number;
  prizePool?: string;
}

export interface TournamentDetail extends Tournament {
  rounds: number;
  currentRound: number;
  games: GameSummary[];
}

export interface Standing {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  points: number;
  tiebreak: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface Friend {
  id: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  online: boolean;
}

export interface FriendRequest {
  id: string;
  fromUser: { id: string; username: string; avatarUrl: string | null };
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: 'friend_request' | 'friend_accepted' | 'game_invite' | 'tournament_start' | 'game_result';
  message: string;
  read: boolean;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface PaginatedGames {
  games: GameSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}
```

## Hook Files to Create

### `frontend/src/hooks/api/useUser.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type { AuthUser, PublicUserProfile } from '@/types/api';

export function useCurrentUser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.user.me(),
    queryFn: () => api.get<AuthUser>('/users/me').then((r) => r.data),
    staleTime: 60_000,
    enabled: isAuthenticated,
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user.byId(userId),
    queryFn: () => api.get<PublicUserProfile>(`/users/${userId}`).then((r) => r.data),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });
}
```

### `frontend/src/hooks/api/useGames.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { PaginatedGames, GameDetail, ActiveGameState } from '@/types/api';

export function useGames(userId: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.games.byUser(userId),
    queryFn: () =>
      api
        .get<PaginatedGames>('/games', { params: { userId, page } })
        .then((r) => r.data),
    staleTime: 30_000,
    enabled: Boolean(userId),
  });
}

export function useGame(gameId: string) {
  return useQuery({
    queryKey: queryKeys.games.byId(gameId),
    queryFn: () => api.get<GameDetail>(`/games/${gameId}`).then((r) => r.data),
    staleTime: 30_000,
    enabled: Boolean(gameId),
  });
}

// Polling fallback for active game (in case WebSocket drops)
export function useActiveGame(gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.games.byId(gameId),
    queryFn: () => api.get<ActiveGameState>(`/games/${gameId}`).then((r) => r.data),
    staleTime: 0,
    refetchInterval: enabled ? 5_000 : false,
    enabled: Boolean(gameId) && enabled,
  });
}
```

### `frontend/src/hooks/api/useLeaderboard.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { LeaderboardPage } from '@/types/api';

export function useLeaderboard(
  variant: 'standard' | 'bullet' | 'blitz' | 'rapid' = 'standard',
  timeControl = 'all',
  page = 1
) {
  return useQuery({
    queryKey: queryKeys.leaderboard.all(variant, timeControl),
    queryFn: () =>
      api
        .get<LeaderboardPage>('/leaderboard', { params: { variant, timeControl, page } })
        .then((r) => r.data),
    staleTime: 30_000,
  });
}
```

### `frontend/src/hooks/api/usePuzzles.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Puzzle, PuzzleFilters, PuzzleSolution, PuzzleResult } from '@/types/api';

export function useDailyPuzzle() {
  return useQuery({
    queryKey: queryKeys.puzzles.daily(),
    queryFn: () => api.get<Puzzle>('/puzzles/daily').then((r) => r.data),
    staleTime: Infinity, // Puzzle content is static — never background refetch
  });
}

export function usePuzzles(filters: PuzzleFilters = {}) {
  return useQuery({
    queryKey: queryKeys.puzzles.list(filters),
    queryFn: () => api.get<Puzzle[]>('/puzzles', { params: filters }).then((r) => r.data),
    staleTime: Infinity,
  });
}

export function usePuzzle(puzzleId: string) {
  return useQuery({
    queryKey: queryKeys.puzzles.byId(puzzleId),
    queryFn: () => api.get<Puzzle>(`/puzzles/${puzzleId}`).then((r) => r.data),
    staleTime: Infinity,
    enabled: Boolean(puzzleId),
  });
}

export function useSubmitPuzzle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (solution: PuzzleSolution) =>
      api.post<PuzzleResult>(`/puzzles/${solution.puzzleId}/submit`, solution).then((r) => r.data),
    onSuccess: (_data, variables) => {
      // Invalidate so the puzzle shows its solved state
      queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.byId(variables.puzzleId) });
    },
  });
}
```

### `frontend/src/hooks/api/useTournaments.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { Tournament, TournamentDetail, Standing } from '@/types/api';

export function useTournaments(status: 'upcoming' | 'active' | 'completed' = 'upcoming') {
  return useQuery({
    queryKey: queryKeys.tournaments.list(status),
    queryFn: () =>
      api.get<Tournament[]>('/tournaments', { params: { status } }).then((r) => r.data),
    staleTime: 5_000,
    refetchInterval: status === 'active' ? 5_000 : false,
  });
}

export function useTournament(tournamentId: string) {
  return useQuery({
    queryKey: queryKeys.tournaments.byId(tournamentId),
    queryFn: () => api.get<TournamentDetail>(`/tournaments/${tournamentId}`).then((r) => r.data),
    staleTime: 5_000,
    enabled: Boolean(tournamentId),
  });
}

export function useTournamentStandings(tournamentId: string, isActive = false) {
  return useQuery({
    queryKey: queryKeys.tournaments.standings(tournamentId),
    queryFn: () =>
      api.get<Standing[]>(`/tournaments/${tournamentId}/standings`).then((r) => r.data),
    staleTime: 5_000,
    refetchInterval: isActive ? 5_000 : false,
    enabled: Boolean(tournamentId),
  });
}

export function useJoinTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post(`/tournaments/${tournamentId}/join`).then((r) => r.data),
    onSuccess: (_data, tournamentId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments.byId(tournamentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments.list('upcoming') });
    },
  });
}

export function useLeaveTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post(`/tournaments/${tournamentId}/leave`).then((r) => r.data),
    onSuccess: (_data, tournamentId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments.byId(tournamentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments.list('upcoming') });
    },
  });
}
```

### `frontend/src/hooks/api/useSocial.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type { Friend, FriendRequest } from '@/types/api';

export function useFriends(userId: string) {
  return useQuery({
    queryKey: queryKeys.social.friends(userId),
    queryFn: () => api.get<Friend[]>('/social/friends').then((r) => r.data),
    staleTime: 30_000,
    enabled: Boolean(userId),
  });
}

export function useFriendRequests(userId: string) {
  return useQuery({
    queryKey: queryKeys.social.requests(userId),
    queryFn: () => api.get<FriendRequest[]>('/social/requests').then((r) => r.data),
    staleTime: 30_000,
    enabled: Boolean(userId),
  });
}

export function useSendFriendRequest() {
  return useMutation({
    mutationFn: (targetUserId: string) =>
      api.post(`/social/requests/${targetUserId}`).then((r) => r.data),
  });
}

export function useAcceptFriendRequest() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/social/requests/${requestId}/accept`).then((r) => r.data),

    onMutate: async (requestId) => {
      // Cancel any outgoing refetches for friend requests
      await queryClient.cancelQueries({ queryKey: queryKeys.social.requests(userId) });

      // Snapshot the current value for rollback
      const previousRequests = queryClient.getQueryData<FriendRequest[]>(
        queryKeys.social.requests(userId)
      );

      // Optimistic: remove the request from the list immediately
      queryClient.setQueryData<FriendRequest[]>(
        queryKeys.social.requests(userId),
        (old) => old?.filter((r) => r.id !== requestId) ?? []
      );

      return { previousRequests };
    },

    onError: (_err, _requestId, context) => {
      // Rollback on error
      if (context?.previousRequests) {
        queryClient.setQueryData(queryKeys.social.requests(userId), context.previousRequests);
      }
    },

    onSettled: () => {
      // Always resync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.social.requests(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.social.friends(userId) });
    },
  });
}

export function useDeclineFriendRequest() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/social/requests/${requestId}/decline`).then((r) => r.data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.requests(userId) });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useMutation({
    mutationFn: (friendId: string) =>
      api.delete(`/social/friends/${friendId}`).then((r) => r.data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.social.friends(userId) });
    },
  });
}
```

### `frontend/src/hooks/api/useNotifications.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/stores/authStore';
import type { AppNotification } from '@/types/api';

export function useNotifications() {
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useQuery({
    queryKey: queryKeys.notifications.list(userId),
    queryFn: () => api.get<AppNotification[]>('/notifications').then((r) => r.data),
    staleTime: 0, // Always fresh when fetched
    enabled: Boolean(userId),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useMutation({
    mutationFn: (notificationId: string) =>
      api.patch(`/notifications/${notificationId}/read`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? '');

  return useMutation({
    mutationFn: () => api.patch('/notifications/read-all').then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
    },
  });
}
```

### `frontend/src/features/auth/hooks/useAuth.ts`

```typescript
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import type { LoginCredentials, RegisterCredentials, AuthResponse } from '@/types/api';

export function useLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      api.post<AuthResponse>('/auth/login', credentials).then((r) => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (credentials: RegisterCredentials) =>
      api.post<AuthResponse>('/auth/register', credentials).then((r) => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      navigate('/');
    },
  });
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return useMutation({
    mutationFn: () => api.post('/auth/logout').then((r) => r.data),
    onSuccess: () => {
      clearAuth();
      queryClient.clear(); // Wipe all cached server data
      window.location.href = '/login'; // Hard redirect to clear any React state
    },
    onError: () => {
      // Even on error, clear local auth and redirect
      clearAuth();
      queryClient.clear();
      window.location.href = '/login';
    },
  });
}
```

## Modify `frontend/src/App.tsx`

Wrap the app in `QueryClientProvider` and add `ReactQueryDevtools`:

```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';

// Wrap the existing app structure:
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* existing RouterProvider or Router here */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

## Verification Checklist

- `useCurrentUser` only fires when `isAuthenticated` is true
- `useDailyPuzzle` has `staleTime: Infinity` — check in React Query DevTools
- `useActiveGame(id, false)` — `enabled: false` stops polling
- `useAcceptFriendRequest` shows immediate UI update before server responds
- `useLogout` calls `queryClient.clear()` — all query caches empty after logout
- React Query DevTools tab appears in dev mode bottom-right corner
- All hooks are fully typed with no TypeScript errors
