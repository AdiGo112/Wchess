# Feature 09 — Social: Increment 5 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 5 of the Social feature for ChessWeb, a NestJS 10 + React chess platform.

**Increment 5 goal**: Build the frontend Social UI — the Friends page, Activity Feed page, real-time presence via Socket.io, and the Zustand slice for real-time updates.

## Existing Codebase State

- React + TypeScript frontend with Vite
- React Query (`@tanstack/react-query`) for server state
- Zustand for client state
- `socket.io-client` installed
- Tailwind CSS for styling
- React Router for routing
- `src/api/axios.ts` (or equivalent) exports a configured axios instance with the JWT Authorization header injected automatically
- `useAuth()` hook returns `{ accessToken: string, user: { id, username } }`
- `queryClient` is the global React Query client (accessible via `useQueryClient()`)

## Backend API Reference

All endpoints require `Authorization: Bearer <accessToken>`.

```
GET    /social/friends                       → { friends: FriendDto[], total: number }
GET    /social/friends/requests/incoming     → { requests: FriendRequestDto[] }
GET    /social/friends/requests/outgoing     → { requests: FriendRequestDto[] }
POST   /social/friends/request               body: { addresseeId }  → FriendshipDto
POST   /social/friends/:id/accept            → FriendshipDto
POST   /social/friends/:id/decline           → FriendshipDto
DELETE /social/friends/:id                   → { message: string }
POST   /social/friends/:id/block             → FriendshipDto
GET    /users/search?q=<query>               → { users: UserSearchResultDto[] }
GET    /social/activity-feed?cursor=&limit=  → { entries: FeedEntryDto[], nextCursor: string|null, hasMore: boolean }
```

Socket.io `/presence` namespace:
- Connect with `{ auth: { token: accessToken } }`
- Emit `heartbeat` every 25 seconds
- Listen `friend_online` → `{ userId: string }`
- Listen `friend_offline` → `{ userId: string }`
- Listen `friend_request_received` → invalidate incoming requests query
- Listen `friend_accepted` → invalidate friends query

## TypeScript Types

```typescript
interface FriendDto {
  friendshipId: string;
  id: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
  lastSeen: string | null;
}

interface FriendRequestDto {
  id: string;
  requesterId?: string;
  requesterUsername?: string;
  requesterAvatar?: string | null;
  addresseeId?: string;
  addresseeUsername?: string;
  addresseeAvatar?: string | null;
  createdAt: string;
}

interface UserSearchResultDto {
  id: string;
  username: string;
  avatar: string | null;
  isFriend: boolean;
  hasPendingRequest: boolean;
}

interface FeedEntryDto {
  id: string;
  actorId: string;
  actorUsername: string;
  actorAvatar?: string | null;
  type: 'GAME_WON' | 'GAME_LOST' | 'GAME_DRAWN' | 'PUZZLE_SOLVED' | 'ACHIEVEMENT' | 'GAME_STARTED';
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

## Files to Create

### File 1: `src/api/social.ts`

```typescript
import api from './axios'; // your configured axios instance
import type {
  FriendDto, FriendRequestDto, UserSearchResultDto, FeedEntryDto
} from '../types/social';

export const socialApi = {
  getFriends: () =>
    api.get<{ friends: FriendDto[]; total: number }>('/social/friends').then(r => r.data),

  getIncomingRequests: () =>
    api.get<{ requests: FriendRequestDto[] }>('/social/friends/requests/incoming').then(r => r.data),

  getOutgoingRequests: () =>
    api.get<{ requests: FriendRequestDto[] }>('/social/friends/requests/outgoing').then(r => r.data),

  sendFriendRequest: (addresseeId: string) =>
    api.post('/social/friends/request', { addresseeId }).then(r => r.data),

  acceptRequest: (id: string) =>
    api.post(`/social/friends/${id}/accept`).then(r => r.data),

  declineRequest: (id: string) =>
    api.post(`/social/friends/${id}/decline`).then(r => r.data),

  unfriend: (id: string) =>
    api.delete(`/social/friends/${id}`).then(r => r.data),

  searchUsers: (q: string) =>
    api.get<{ users: UserSearchResultDto[] }>(`/users/search?q=${encodeURIComponent(q)}`).then(r => r.data),

  getActivityFeed: (cursor?: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return api.get<{ entries: FeedEntryDto[]; nextCursor: string | null; hasMore: boolean }>(
      `/social/activity-feed?${params}`
    ).then(r => r.data);
  },
};
```

### File 2: `src/store/socialSlice.ts`

```typescript
import { create } from 'zustand';

interface SocialState {
  onlineFriendIds: Set<string>;
  pendingRequestCount: number;
  setFriendOnline: (userId: string) => void;
  setFriendOffline: (userId: string) => void;
  setPendingRequestCount: (n: number) => void;
  initOnlineFriends: (userIds: string[]) => void;
}

export const useSocialStore = create<SocialState>((set) => ({
  onlineFriendIds: new Set(),
  pendingRequestCount: 0,

  setFriendOnline: (userId) =>
    set((state) => ({ onlineFriendIds: new Set([...state.onlineFriendIds, userId]) })),

  setFriendOffline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineFriendIds);
      next.delete(userId);
      return { onlineFriendIds: next };
    }),

  setPendingRequestCount: (n) => set({ pendingRequestCount: n }),

  initOnlineFriends: (userIds) => set({ onlineFriendIds: new Set(userIds) }),
}));
```

### File 3: `src/hooks/usePresence.ts`

```typescript
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth'; // your auth hook
import { useSocialStore } from '../store/socialSlice';

const HEARTBEAT_INTERVAL_MS = 25_000;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';

export function usePresence() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { setFriendOnline, setFriendOffline } = useSocialStore();

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(`${SOCKET_URL}/presence`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    const heartbeatInterval = setInterval(() => {
      socket.emit('heartbeat');
    }, HEARTBEAT_INTERVAL_MS);

    socket.on('friend_online', ({ userId }: { userId: string }) => {
      setFriendOnline(userId);
    });

    socket.on('friend_offline', ({ userId }: { userId: string }) => {
      setFriendOffline(userId);
    });

    socket.on('friend_request_received', () => {
      queryClient.invalidateQueries({ queryKey: ['friends', 'incoming'] });
    });

    socket.on('friend_accepted', () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    });

    socket.on('connect_error', (err) => {
      console.warn('Presence socket connection error:', err.message);
    });

    return () => {
      clearInterval(heartbeatInterval);
      socket.disconnect();
    };
  }, [accessToken, setFriendOnline, setFriendOffline, queryClient]);
}
```

Call `usePresence()` once in your authenticated layout or `App.tsx`.

### File 4: `src/hooks/useFriends.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../api/social';
import { useSocialStore } from '../store/socialSlice';

export function useFriends() {
  const onlineFriendIds = useSocialStore(s => s.onlineFriendIds);
  const { data, isLoading } = useQuery({
    queryKey: ['friends'],
    queryFn: socialApi.getFriends,
  });

  // Merge server-side isOnline with real-time Zustand store
  const friends = data?.friends.map(f => ({
    ...f,
    isOnline: f.isOnline || onlineFriendIds.has(f.id),
  })) ?? [];

  return { friends, total: data?.total ?? 0, isLoading };
}

export function useUnfriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendshipId: string) => socialApi.unfriend(friendshipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });
}
```

### File 5: `src/hooks/useFriendRequests.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../api/social';
import { useSocialStore } from '../store/socialSlice';

export function useIncomingRequests() {
  const setPendingRequestCount = useSocialStore(s => s.setPendingRequestCount);
  return useQuery({
    queryKey: ['friends', 'incoming'],
    queryFn: async () => {
      const data = await socialApi.getIncomingRequests();
      setPendingRequestCount(data.requests.length);
      return data;
    },
  });
}

export function useAcceptRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => socialApi.acceptRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friends', 'incoming'] });
    },
  });
}

export function useDeclineRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => socialApi.declineRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends', 'incoming'] }),
  });
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (addresseeId: string) => socialApi.sendFriendRequest(addresseeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends', 'outgoing'] }),
  });
}
```

### File 6: `src/hooks/useActivityFeed.ts`

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { socialApi } from '../api/social';

export function useActivityFeed() {
  return useInfiniteQuery({
    queryKey: ['activityFeed'],
    queryFn: ({ pageParam }) => socialApi.getActivityFeed(pageParam as string | undefined),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: undefined,
  });
}
```

### File 7: `src/components/friends/FriendCard.tsx`

```tsx
import React from 'react';
import type { FriendDto } from '../../types/social';
import { useUnfriend } from '../../hooks/useFriends';

interface Props {
  friend: FriendDto & { isOnline: boolean };
}

export function FriendCard({ friend }: Props) {
  const unfriend = useUnfriend();

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white shadow-sm">
      <div className="relative">
        <img
          src={friend.avatar ?? '/default-avatar.png'}
          alt={friend.username}
          className="w-10 h-10 rounded-full object-cover"
        />
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            friend.isOnline ? 'bg-green-500' : 'bg-gray-400'
          }`}
          title={friend.isOnline ? 'Online' : 'Offline'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{friend.username}</p>
        <p className="text-xs text-gray-500">
          {friend.isOnline
            ? 'Online now'
            : friend.lastSeen
            ? `Last seen ${new Date(friend.lastSeen).toLocaleDateString()}`
            : 'Offline'}
        </p>
      </div>
      <button
        onClick={() => unfriend.mutate(friend.friendshipId)}
        disabled={unfriend.isPending}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        Unfriend
      </button>
    </div>
  );
}
```

### File 8: `src/components/friends/FriendRequestCard.tsx`

```tsx
import React from 'react';
import type { FriendRequestDto } from '../../types/social';
import { useAcceptRequest, useDeclineRequest } from '../../hooks/useFriendRequests';

interface Props {
  request: FriendRequestDto;
}

export function FriendRequestCard({ request }: Props) {
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const isPending = accept.isPending || decline.isPending;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white shadow-sm">
      <img
        src={request.requesterAvatar ?? '/default-avatar.png'}
        alt={request.requesterUsername}
        className="w-10 h-10 rounded-full object-cover"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{request.requesterUsername}</p>
        <p className="text-xs text-gray-500">
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => accept.mutate(request.id)}
          disabled={isPending}
          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => decline.mutate(request.id)}
          disabled={isPending}
          className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
```

### File 9: `src/components/friends/UserSearchBar.tsx`

```tsx
import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { socialApi } from '../../api/social';
import { useSendFriendRequest } from '../../hooks/useFriendRequests';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function UserSearchBar() {
  const [query, setQuery] = useState('');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const debouncedQuery = useDebounce(query, 300);
  const sendRequest = useSendFriendRequest();

  const { data } = useQuery({
    queryKey: ['userSearch', debouncedQuery],
    queryFn: () => socialApi.searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const handleSend = useCallback(
    (addresseeId: string) => {
      sendRequest.mutate(addresseeId, {
        onSuccess: () => setSentIds(prev => new Set([...prev, addresseeId])),
      });
    },
    [sendRequest],
  );

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search players..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {data?.users && data.users.length > 0 && query.length >= 2 && (
        <ul className="absolute z-10 top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {data.users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
              <img
                src={user.avatar ?? '/default-avatar.png'}
                alt={user.username}
                className="w-8 h-8 rounded-full"
              />
              <span className="flex-1 text-sm">{user.username}</span>
              {user.isFriend ? (
                <span className="text-xs text-green-600">Friends</span>
              ) : sentIds.has(user.id) || user.hasPendingRequest ? (
                <span className="text-xs text-gray-500">Request Sent</span>
              ) : (
                <button
                  onClick={() => handleSend(user.id)}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  Add Friend
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### File 10: `src/components/feed/FeedItem.tsx`

```tsx
import React from 'react';
import type { FeedEntryDto } from '../../types/social';

const ACTIVITY_LABELS: Record<string, string> = {
  GAME_WON: 'won a game against',
  GAME_LOST: 'lost a game against',
  GAME_DRAWN: 'drew a game against',
  GAME_STARTED: 'started a game against',
  PUZZLE_SOLVED: 'solved a puzzle:',
  ACHIEVEMENT: 'unlocked an achievement:',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  entry: FeedEntryDto;
}

export function FeedItem({ entry }: Props) {
  const ratingChange = entry.metadata?.ratingChange as number | undefined;

  return (
    <div className="flex gap-3 p-4 bg-white rounded-lg shadow-sm">
      <img
        src={entry.actorAvatar ?? '/default-avatar.png'}
        alt={entry.actorUsername}
        className="w-9 h-9 rounded-full flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold">{entry.actorUsername}</span>{' '}
          <span className="text-gray-600">{ACTIVITY_LABELS[entry.type] ?? entry.type}</span>{' '}
          {entry.targetName && (
            <span className="font-medium">{entry.targetName}</span>
          )}
          {ratingChange !== undefined && (
            <span
              className={`ml-2 text-xs font-bold ${
                ratingChange >= 0 ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {ratingChange >= 0 ? `+${ratingChange}` : ratingChange}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(entry.createdAt)}</p>
      </div>
    </div>
  );
}
```

### File 11: `src/pages/FriendsPage.tsx`

```tsx
import React, { useState } from 'react';
import { useFriends } from '../hooks/useFriends';
import { useIncomingRequests } from '../hooks/useFriendRequests';
import { FriendCard } from '../components/friends/FriendCard';
import { FriendRequestCard } from '../components/friends/FriendRequestCard';
import { UserSearchBar } from '../components/friends/UserSearchBar';
import { useSocialStore } from '../store/socialSlice';

type Tab = 'friends' | 'requests';

export function FriendsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const { friends, total, isLoading } = useFriends();
  const { data: requestsData } = useIncomingRequests();
  const pendingCount = useSocialStore(s => s.pendingRequestCount);

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Friends</h1>
      <UserSearchBar />

      <div className="flex border-b mt-4 mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'friends'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('friends')}
        >
          Friends ({total})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium relative ${
            activeTab === 'requests'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500'
          }`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {pendingCount > 0 && (
            <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'friends' && (
        <div className="space-y-2">
          {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
          {!isLoading && friends.length === 0 && (
            <p className="text-gray-500 text-sm">No friends yet. Search for players above!</p>
          )}
          {friends.map(friend => (
            <FriendCard key={friend.id} friend={friend} />
          ))}
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-2">
          {(requestsData?.requests ?? []).length === 0 && (
            <p className="text-gray-500 text-sm">No pending requests.</p>
          )}
          {(requestsData?.requests ?? []).map(req => (
            <FriendRequestCard key={req.id} request={req} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### File 12: `src/pages/ActivityFeedPage.tsx`

```tsx
import React from 'react';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { FeedItem } from '../components/feed/FeedItem';

export function ActivityFeedPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityFeed();

  const allEntries = data?.pages.flatMap(p => p.entries) ?? [];

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">Activity Feed</h1>

      {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}

      {!isLoading && allEntries.length === 0 && (
        <p className="text-gray-500 text-sm">
          No activity yet. Add friends to see what they've been up to!
        </p>
      )}

      <div className="space-y-3">
        {allEntries.map(entry => (
          <FeedItem key={entry.id} entry={entry} />
        ))}
      </div>

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full mt-4 py-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

### File 13: Update router

Add routes to your React Router configuration:

```tsx
{ path: '/friends', element: <FriendsPage /> },
{ path: '/feed', element: <ActivityFeedPage /> },
```

### File 14: Update `src/App.tsx` (or authenticated layout)

Add the `usePresence()` call at the top level so it persists across route changes:

```tsx
import { usePresence } from './hooks/usePresence';

// Inside your authenticated App/Layout component:
usePresence();
```

## Verification

1. Navigate to `/friends` — should render the friends list and search bar
2. Search for a user — dropdown should appear within 300ms of typing 2+ characters
3. Click "Add Friend" — button changes to "Request Sent"
4. Open the same app in a second browser tab as a different user and accept the request
5. Refresh `/friends` in the first tab — new friend should appear
6. Open a second tab as the friend — within 5 seconds, the first tab should show the friend as online (green dot)
7. Close the friend's tab — within 5 seconds, the first tab should show offline (gray dot)
8. Navigate to `/feed` — activity entries should appear; click "Load More" to paginate
9. Open browser DevTools → Network → WS — verify `heartbeat` messages every ~25 seconds
