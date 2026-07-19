# Feature 12 — Frontend UI: Increment 2 Implementation Plan

## Scope

Create all React Query hooks in `frontend/src/hooks/api/`. Each hook wraps an API endpoint with the correct cache key (from `queryKeys.ts`), staleTime, refetchInterval, and TypeScript return types. Implement the `useAcceptFriendRequest` optimistic update pattern with rollback. Wire `<QueryClientProvider>` into the React root in `App.tsx`. Add React Query DevTools gated behind `import.meta.env.DEV`.

Also covers the logout mutation that calls `queryClient.clear()` and wipes all cached data.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/hooks/api/useUser.ts` | Create |
| `frontend/src/hooks/api/useGames.ts` | Create |
| `frontend/src/hooks/api/useLeaderboard.ts` | Create |
| `frontend/src/hooks/api/usePuzzles.ts` | Create |
| `frontend/src/hooks/api/useTournaments.ts` | Create |
| `frontend/src/hooks/api/useSocial.ts` | Create |
| `frontend/src/hooks/api/useNotifications.ts` | Create |
| `frontend/src/App.tsx` | Modify — wrap in `<QueryClientProvider client={queryClient}>` |
| `frontend/src/features/auth/hooks/useAuth.ts` | Create — `useLogin`, `useRegister`, `useLogout` mutations |
| `frontend/package.json` | Modify — add `@tanstack/react-query-devtools` as devDependency |
| `frontend/src/types/api.ts` | Create — response type interfaces for all API endpoints |

## Acceptance Criteria

- [ ] `useCurrentUser()` fetches `GET /users/me` and returns `AuthUser` shape
- [ ] `useCurrentUser()` has `staleTime: 60_000`
- [ ] `useDailyPuzzle()` has `staleTime: Infinity` — does not refetch in background
- [ ] `useActiveGame(gameId, true)` has `refetchInterval: 5000` — polls every 5 seconds
- [ ] `useActiveGame(gameId, false)` does NOT poll — `enabled: false` stops the hook
- [ ] `useTournamentStandings(id)` has `refetchInterval: 5000` — polls during active tournament
- [ ] `useLeaderboard` has `staleTime: 30_000`
- [ ] `useAcceptFriendRequest` removes the request from the list immediately (optimistic)
- [ ] `useAcceptFriendRequest` rolls back if the API returns an error
- [ ] `useAcceptFriendRequest` invalidates `['friendRequests', userId]` and `['friends', userId]` on settle
- [ ] `useLogout` mutation calls `queryClient.clear()` after `POST /auth/logout`
- [ ] `useLogout` redirects to `/login` using `window.location.href`
- [ ] `<QueryClientProvider>` is present in `App.tsx` wrapping all route content
- [ ] React Query DevTools only visible when `import.meta.env.DEV === true`
- [ ] All hook return types are typed (no implicit `any`)
- [ ] Cache key arrays match the `queryKeys.ts` constants exactly

## Dependencies

- Increment 1 complete (authStore, queryClient.ts, queryKeys.ts exist)
- `frontend/src/lib/api.ts` (Axios instance) already exists from prior feature work
- All API endpoints already implemented in NestJS backend

## Complexity

**M** — Many files, but each hook follows the same pattern. The `useAcceptFriendRequest` optimistic update is the most complex piece (~30 lines). `staleTime` and `refetchInterval` configuration requires care.
