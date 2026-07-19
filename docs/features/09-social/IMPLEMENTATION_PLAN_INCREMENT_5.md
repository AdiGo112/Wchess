# Feature 09 — Social: Increment 5 Implementation Plan

## Scope

Implement the frontend Social feature in React + TypeScript. This increment creates the `/friends` page (friends list with online indicators, pending requests panel, user search), the `/feed` page (activity feed timeline with infinite scroll), a `usePresence` hook that connects to the Socket.io `/presence` namespace, and a `socialSlice` in Zustand for local real-time state. All API calls go through React Query for caching and loading states.

## Files Created / Modified

| File | Action |
|------|--------|
| `frontend/src/pages/FriendsPage.tsx` | Created |
| `frontend/src/pages/ActivityFeedPage.tsx` | Created |
| `frontend/src/components/friends/FriendCard.tsx` | Created |
| `frontend/src/components/friends/FriendRequestCard.tsx` | Created |
| `frontend/src/components/friends/UserSearchBar.tsx` | Created |
| `frontend/src/components/feed/FeedItem.tsx` | Created |
| `frontend/src/hooks/useFriends.ts` | Created |
| `frontend/src/hooks/useFriendRequests.ts` | Created |
| `frontend/src/hooks/useActivityFeed.ts` | Created |
| `frontend/src/hooks/usePresence.ts` | Created |
| `frontend/src/store/socialSlice.ts` | Created |
| `frontend/src/api/social.ts` | Created |
| `frontend/src/router.tsx` (or equivalent) | Modified — add `/friends` and `/feed` routes |

## Steps

### Step 1: Create API layer (`src/api/social.ts`)

Thin wrappers around axios/fetch for every social endpoint. Returns typed DTOs.

```typescript
export const socialApi = {
  sendFriendRequest: (addresseeId: string) => api.post('/social/friends/request', { addresseeId }),
  acceptRequest: (id: string) => api.post(`/social/friends/${id}/accept`),
  declineRequest: (id: string) => api.post(`/social/friends/${id}/decline`),
  unfriend: (id: string) => api.delete(`/social/friends/${id}`),
  blockUser: (id: string) => api.post(`/social/friends/${id}/block`),
  getFriends: () => api.get<FriendsResponse>('/social/friends'),
  getIncomingRequests: () => api.get<RequestsResponse>('/social/friends/requests/incoming'),
  getOutgoingRequests: () => api.get<RequestsResponse>('/social/friends/requests/outgoing'),
  searchUsers: (q: string) => api.get<UserSearchResponse>(`/users/search?q=${q}`),
  getActivityFeed: (cursor?: string, limit = 20) =>
    api.get<FeedResponse>(`/social/activity-feed?${cursor ? `cursor=${cursor}&` : ''}limit=${limit}`),
};
```

### Step 2: Create React Query hooks

**`useFriends`**: `useQuery(['friends'], socialApi.getFriends)`

**`useFriendRequests`**: `useQuery(['friends', 'incoming'], socialApi.getIncomingRequests)`

**`useActivityFeed`**: `useInfiniteQuery` with `getNextPageParam: (lastPage) => lastPage.nextCursor`

### Step 3: Create `usePresence` hook

```typescript
export function usePresence() {
  const { accessToken } = useAuth();
  const setFriendOnline = useSocialStore(s => s.setFriendOnline);
  const setFriendOffline = useSocialStore(s => s.setFriendOffline);

  useEffect(() => {
    const socket = io('/presence', { auth: { token: accessToken } });
    const heartbeatInterval = setInterval(() => socket.emit('heartbeat'), 25000);
    socket.on('friend_online', ({ userId }) => setFriendOnline(userId));
    socket.on('friend_offline', ({ userId }) => setFriendOffline(userId));
    socket.on('friend_request_received', () => queryClient.invalidateQueries(['friends', 'incoming']));
    socket.on('friend_accepted', () => queryClient.invalidateQueries(['friends']));
    return () => { clearInterval(heartbeatInterval); socket.disconnect(); };
  }, [accessToken]);
}
```

Call `usePresence()` once in the top-level `App.tsx` (or an authenticated layout component) so the socket is created once per session.

### Step 4: Create Zustand `socialSlice`

```typescript
interface SocialState {
  onlineFriendIds: Set<string>;
  pendingRequestCount: number;
  setFriendOnline: (userId: string) => void;
  setFriendOffline: (userId: string) => void;
  setPendingRequestCount: (n: number) => void;
}
```

`FriendCard` merges `isOnline` from the React Query response with the Zustand `onlineFriendIds` set for real-time updates that arrive between refetches.

### Step 5: Create components

**`FriendCard`**: Shows avatar, username, online dot (green if `isOnline`), and "Unfriend" button. Online dot is `w-2 h-2 rounded-full bg-green-500` (Tailwind) when online, `bg-gray-400` when offline.

**`FriendRequestCard`**: Shows requester avatar + username + "Accept" and "Decline" buttons. On accept/decline, calls React Query mutation and invalidates `['friends']` and `['friends', 'incoming']`.

**`UserSearchBar`**: Debounced input (300ms), calls `GET /users/search`, renders dropdown results with "Add Friend" button. Disabled with "Request Sent" label after successful request.

**`FeedItem`**: Renders a single activity entry with actor avatar, verb (won/lost/solved), target name, rating change badge, and relative timestamp.

### Step 6: Create pages

**`FriendsPage`** (`/friends`): Two tabs — "Friends" (renders `FriendCard` list) and "Requests" (renders `FriendRequestCard` list). `UserSearchBar` at the top.

**`ActivityFeedPage`** (`/feed`): Infinite scroll list of `FeedItem` components. "Load More" button calls `fetchNextPage` from `useInfiniteQuery`.

## Acceptance Criteria

- [ ] `/friends` page renders friends list with correct online/offline indicators
- [ ] Online indicator updates in real time (within 5 seconds) when a friend connects or disconnects
- [ ] Pending requests tab shows incoming requests with Accept/Decline buttons
- [ ] Accepting a request updates both the requester's and addressee's friends lists
- [ ] User search returns results and "Add Friend" button creates a request
- [ ] `/feed` page renders activity feed entries with actor name, type, and timestamp
- [ ] Infinite scroll / "Load More" loads the next page using cursor pagination
- [ ] `usePresence` heartbeat interval is 25 seconds (verifiable in browser DevTools → Network → WS)
- [ ] No TypeScript errors in `npm run build`
- [ ] All social-related API calls include the JWT Authorization header

## Complexity

**L** — The largest increment in terms of file count. The main complexity is the real-time Zustand / React Query merge (ensuring the UI updates from both sources without double-rendering), the `usePresence` hook cleanup (clearing the interval and disconnecting the socket on unmount), and the infinite scroll cursor logic.
