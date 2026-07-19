# ADR-0030 — TanStack Query for All Server-Derived State

## Status
Accepted

## Context

ChessWeb's frontend must display data from 11 backend features: user profiles, game history, leaderboard, puzzles, tournaments, social graph, notifications history, and more. This data:

- Has a canonical source on the server
- Goes stale and must be periodically refreshed
- Is shared between multiple page components (e.g., user profile shown in NavBar, ProfilePage, and GamePage simultaneously)
- May benefit from optimistic updates during mutations (e.g., accepting a friend request should immediately update the friend list in the UI)

We evaluated three approaches: **manual `useEffect` + `useState`**, **Redux Toolkit Query (RTK Query)**, and **TanStack Query v5**.

### Manual `useEffect` + `useState`

This is the baseline: `useEffect(() => { fetch(...).then(setData) }, [deps])`.

**Problems**:
- No shared cache — two components mounting simultaneously both fire the same network request
- No background refresh — stale data shows until user navigates away and back
- No deduplication — rapid re-renders cause request storms
- No loading/error/success states — every component reinvents the pattern
- Optimistic updates require careful manual state management with rollback on error
- At 11 backend features × ~3 queries each, this would be ~33 custom fetch hooks with duplicated logic

### RTK Query

RTK Query is the official server state solution in the Redux ecosystem. It auto-generates hooks from endpoint definitions, handles caching, invalidation via tags, and integrates with Redux DevTools.

**Problems**:
- Requires Redux store — we chose Zustand (ADR-0029); introducing Redux purely for RTK Query adds ~13kb and two different state paradigms in the same app
- Tag-based cache invalidation requires mapping every mutation to affected query tags — verbose for complex data graphs
- Bundle size: ~11kb gzipped on top of Redux

### TanStack Query v5

TanStack Query decouples server state management from the component tree. It provides a `QueryClient` singleton that stores a normalized cache keyed by query keys. Components declare what data they need via `useQuery`; the library handles fetching, caching, background refresh, deduplication, and retry.

**Strengths for ChessWeb**:
- Zero dependency on Redux — works alongside Zustand cleanly
- `queryKey` array supports fine-grained cache invalidation: `['games', userId]` invalidates all games for one user without touching other cached data
- `staleTime` per query allows different freshness budgets: puzzles (Infinity), leaderboard (30s), active game (0ms + polling)
- `useMutation` + `onMutate`/`onError`/`onSettled` lifecycle covers optimistic updates with automatic rollback
- Built-in `suspense: true` mode integrates with React 18's `<Suspense>` and our lazy-loaded routes
- 13kb gzipped but no additional peer dependencies

## Decision

Use **TanStack Query v5** for all server-derived state. The `QueryClient` is configured in `frontend/src/lib/queryClient.ts` and provided at the React root via `<QueryClientProvider>`.

**Cache key conventions** (enforce team-wide):

```typescript
// User
['user', userId]                    // single user profile
['user', 'me']                      // current authenticated user

// Games
['games', userId]                   // user's game history
['game', gameId]                    // single game detail

// Leaderboard
['leaderboard', variant, timeControl]

// Puzzles
['puzzle', 'daily']
['puzzles', { page, difficulty }]
['puzzle', puzzleId]

// Tournaments
['tournaments', { status }]         // list by status
['tournament', tournamentId]        // single tournament
['tournament', tournamentId, 'standings']

// Social
['friends', userId]
['friendRequests', userId]

// Notifications
['notifications', userId]
```

**staleTime overrides per resource** (configured in each hook):

| Resource | staleTime | refetchInterval | Rationale |
|---|---|---|---|
| User profile | 60_000ms | — | Changes infrequently |
| Leaderboard | 30_000ms | — | User manually refreshes |
| Puzzle | Infinity | — | Static content |
| Active game | 0ms | 5_000ms | Polling fallback if WebSocket drops |
| Tournament | 5_000ms | 5_000ms | Fast-moving during active rounds |
| Game history | 30_000ms | — | Historical, no urgency |
| Friends list | 30_000ms | — | Changes infrequently |
| Notifications | 0ms | — | Fetched on notification drawer open |

**Invalidation triggers**:

- `POST /games/:id/move` → invalidate `['game', gameId]`
- `POST /friends/accept/:id` → invalidate `['friends', userId]`, `['friendRequests', userId]`
- `POST /tournaments/:id/join` → invalidate `['tournament', tournamentId]`
- Auth logout (`clearAuth()`) → `queryClient.clear()` to wipe all cached user data

## Consequences

**Positive**:
- Single source of truth for all API data — no "stale NavBar avatar" bugs
- Background refresh keeps leaderboard and tournament data fresh without user interaction
- Deduplication: 20 components subscribing to `['user', 'me']` produce one network request
- Optimistic updates in friend accept/decline flow improve perceived performance
- DevTools (`@tanstack/react-query-devtools`) visible in development builds

**Negative**:
- Developers must learn query key conventions and follow them consistently — a mismatched key creates a duplicate cache entry
- `staleTime: Infinity` for puzzles means stale puzzle data survives until explicit `invalidateQueries` — mutations must remember to invalidate
- React Query's `suspense` mode requires all parent routes to have `<Suspense>` fallbacks (already required by our code splitting — so this is pre-paid)
- Pagination and infinite scroll queries (`useInfiniteQuery`) are more complex than simple `useQuery` — requires careful `getNextPageParam` configuration
