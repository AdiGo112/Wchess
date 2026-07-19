# Feature 09 — Social: Frontend Implementation Prompt (Increment 5)

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained and covers all frontend work for the Social feature.

---

You are implementing the complete frontend for Feature 09 — Social (Friendships, Online Presence, Activity Feed) for ChessWeb, a NestJS 10 + React chess platform.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** build tool
- **React Router v6** for routing
- **@tanstack/react-query v5** for server state
- **Zustand** for client state
- **socket.io-client** for WebSocket connection
- **Tailwind CSS** for styling
- Environment variables accessed via `import.meta.env.VITE_*`

## What Already Exists

- `src/api/axios.ts` — a configured axios instance that automatically attaches `Authorization: Bearer <token>` header from the auth store
- `useAuth()` hook returning `{ accessToken: string | null, user: { id: string, username: string } | null }`
- `queryClient` accessible via `useQueryClient()`
- React Router `<Routes>` in `src/App.tsx` or `src/router.tsx`
- Zustand store setup (you will add a new `socialSlice`)
- Environment variables: `VITE_API_URL` (REST base), `VITE_SOCKET_URL` (WebSocket server root)

## Backend API Reference

All REST endpoints require `Authorization: Bearer <token>`. The axios instance handles this automatically.

```
GET    /social/friends                         → { friends: FriendDto[], total: number }
GET    /social/friends/requests/incoming       → { requests: IncomingRequestDto[] }
GET    /social/friends/requests/outgoing       → { requests: OutgoingRequestDto[] }
POST   /social/friends/request                 body: { addresseeId: string } → FriendshipDto
POST   /social/friends/:id/accept              → FriendshipDto
POST   /social/friends/:id/decline             → FriendshipDto
DELETE /social/friends/:id                     → { message: string }
POST   /social/friends/:id/block               → FriendshipDto
GET    /users/search?q=<query>                 → { users: UserSearchResultDto[] }
GET    /social/activity-feed?cursor=&limit=    → FeedPageDto
```

Socket.io `/presence` namespace:
- Connect: `io(VITE_SOCKET_URL + '/presence', { auth: { token: accessToken } })`
- Emit: `heartbeat` every 25 seconds
- Receive: `friend_online { userId }`, `friend_offline { userId }`, `friend_request_received`, `friend_accepted`

## TypeScript Types

```typescript
// src/types/social.ts
export interface FriendDto {
  friendshipId: string;
  id: string;
  username: string;
  avatar: string | null;
  isOnline: boolean;
  lastSeen: string | null;
}

export interface IncomingRequestDto {
  id: string;
  requesterId: string;
  requesterUsername: string;
  requesterAvatar: string | null;
  createdAt: string;
}

export interface OutgoingRequestDto {
  id: string;
  addresseeId: string;
  addresseeUsername: string;
  addresseeAvatar: string | null;
  createdAt: string;
}

export interface UserSearchResultDto {
  id: string;
  username: string;
  avatar: string | null;
  isFriend: boolean;
  hasPendingRequest: boolean;
}

export interface FeedEntryDto {
  id: string;
  actorId: string;
  actorUsername: string;
  actorAvatar: string | null;
  type: 'GAME_WON' | 'GAME_LOST' | 'GAME_DRAWN' | 'GAME_STARTED' | 'PUZZLE_SOLVED' | 'ACHIEVEMENT';
  targetId: string | null;
  targetName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FeedPageDto {
  entries: FeedEntryDto[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

## Complete File List to Produce

```
src/
├── types/
│   └── social.ts                           (types above)
├── api/
│   └── social.ts                           (API layer)
├── store/
│   └── socialSlice.ts                      (Zustand slice)
├── hooks/
│   ├── usePresence.ts                      (Socket.io hook)
│   ├── useFriends.ts                       (React Query + Zustand merge)
│   ├── useFriendRequests.ts                (React Query mutations)
│   └── useActivityFeed.ts                  (infinite query)
├── components/
│   ├── friends/
│   │   ├── FriendCard.tsx
│   │   ├── FriendRequestCard.tsx
│   │   └── UserSearchBar.tsx
│   └── feed/
│       └── FeedItem.tsx
└── pages/
    ├── FriendsPage.tsx
    └── ActivityFeedPage.tsx
```

---

## Implementation

### `src/types/social.ts`

(Paste the TypeScript types defined above.)

---

### `src/api/social.ts`

```typescript
import api from './axios';
import type {
  FriendDto, IncomingRequestDto, OutgoingRequestDto,
  UserSearchResultDto, FeedPageDto,
} from '../types/social';

export const socialApi = {
  getFriends: () =>
    api.get<{ friends: FriendDto[]; total: number }>('/social/friends').then(r => r.data),

  getIncomingRequests: () =>
    api.get<{ requests: IncomingRequestDto[] }>('/social/friends/requests/incoming').then(r => r.data),

  getOutgoingRequests: () =>
    api.get<{ requests: OutgoingRequestDto[] }>('/social/friends/requests/outgoing').then(r => r.data),

  sendFriendRequest: (addresseeId: string) =>
    api.post('/social/friends/request', { addresseeId }).then(r => r.data),

  acceptRequest: (id: string) =>
    api.post(`/social/friends/${id}/accept`).then(r => r.data),

  declineRequest: (id: string) =>
    api.post(`/social/friends/${id}/decline`).then(r => r.data),

  unfriend: (id: string) =>
    api.delete(`/social/friends/${id}`).then(r => r.data),

  blockUser: (id: string) =>
    api.post(`/social/friends/${id}/block`).then(r => r.data),

  searchUsers: (q: string) =>
    api.get<{ users: UserSearchResultDto[] }>(`/users/search?q=${encodeURIComponent(q)}`).then(r => r.data),

  getActivityFeed: (cursor?: string, limit = 20) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return api.get<FeedPageDto>(`/social/activity-feed?${params}`).then(r => r.data);
  },
};
```

---

### `src/store/socialSlice.ts`

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
    set((s) => ({ onlineFriendIds: new Set([...s.onlineFriendIds, userId]) })),

  setFriendOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineFriendIds);
      next.delete(userId);
      return { onlineFriendIds: next };
    }),

  setPendingRequestCount: (n) => set({ pendingRequestCount: n }),

  initOnlineFriends: (userIds) => set({ onlineFriendIds: new Set(userIds) }),
}));
```

---

### `src/hooks/usePresence.ts`

```typescript
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useSocialStore } from '../store/socialSlice';

const HEARTBEAT_MS = 25_000;

export function usePresence(): void {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const setFriendOnline = useSocialStore((s) => s.setFriendOnline);
  const setFriendOffline = useSocialStore((s) => s.setFriendOffline);

  useEffect(() => {
    if (!accessToken) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000';
    const socket = io(`${socketUrl}/presence`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    const heartbeat = setInterval(() => socket.emit('heartbeat'), HEARTBEAT_MS);

    socket.on('friend_online', ({ userId }: { userId: string }) => setFriendOnline(userId));
    socket.on('friend_offline', ({ userId }: { userId: string }) => setFriendOffline(userId));
    socket.on('friend_request_received', () => {
      queryClient.invalidateQueries({ queryKey: ['friends', 'incoming'] });
    });
    socket.on('friend_accepted', () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    });
    socket.on('connect_error', (err) => {
      console.warn('[Presence] connection error:', err.message);
    });

    return () => {
      clearInterval(heartbeat);
      socket.disconnect();
    };
  }, [accessToken, setFriendOnline, setFriendOffline, queryClient]);
}
```

**Important**: call `usePresence()` exactly once, inside your authenticated layout or root `App` component so the socket persists across route changes.

---

### `src/hooks/useFriends.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../api/social';
import { useSocialStore } from '../store/socialSlice';

export function useFriends() {
  const onlineFriendIds = useSocialStore((s) => s.onlineFriendIds);
  const { data, isLoading, error } = useQuery({
    queryKey: ['friends'],
    queryFn: socialApi.getFriends,
  });

  // Server-side isOnline (from GET /friends) merged with real-time Zustand updates
  const friends = (data?.friends ?? []).map((f) => ({
    ...f,
    isOnline: f.isOnline || onlineFriendIds.has(f.id),
  }));

  return { friends, total: data?.total ?? 0, isLoading, error };
}

export function useUnfriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendshipId: string) => socialApi.unfriend(friendshipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (friendshipId: string) => socialApi.blockUser(friendshipId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  });
}
```

---

### `src/hooks/useFriendRequests.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { socialApi } from '../api/social';
import { useSocialStore } from '../store/socialSlice';

export function useIncomingRequests() {
  const setPendingRequestCount = useSocialStore((s) => s.setPendingRequestCount);
  return useQuery({
    queryKey: ['friends', 'incoming'],
    queryFn: async () => {
      const data = await socialApi.getIncomingRequests();
      setPendingRequestCount(data.requests.length);
      return data;
    },
  });
}

export function useOutgoingRequests() {
  return useQuery({
    queryKey: ['friends', 'outgoing'],
    queryFn: socialApi.getOutgoingRequests,
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

---

### `src/hooks/useActivityFeed.ts`

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { socialApi } from '../api/social';

export function useActivityFeed() {
  return useInfiniteQuery({
    queryKey: ['activityFeed'],
    queryFn: ({ pageParam }) =>
      socialApi.getActivityFeed(pageParam as string | undefined),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    initialPageParam: undefined as string | undefined,
  });
}
```

---

### `src/components/friends/FriendCard.tsx`

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
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white shadow-sm border">
      <div className="relative flex-shrink-0">
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
        className="text-xs text-red-500 hover:underline disabled:opacity-50"
        aria-label={`Unfriend ${friend.username}`}
      >
        Unfriend
      </button>
    </div>
  );
}
```

---

### `src/components/friends/FriendRequestCard.tsx`

```tsx
import React from 'react';
import type { IncomingRequestDto } from '../../types/social';
import { useAcceptRequest, useDeclineRequest } from '../../hooks/useFriendRequests';

interface Props {
  request: IncomingRequestDto;
}

export function FriendRequestCard({ request }: Props) {
  const accept = useAcceptRequest();
  const decline = useDeclineRequest();
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white shadow-sm border">
      <img
        src={request.requesterAvatar ?? '/default-avatar.png'}
        alt={request.requesterUsername}
        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{request.requesterUsername}</p>
        <p className="text-xs text-gray-400">
          {new Date(request.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => accept.mutate(request.id)}
          disabled={busy}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          Accept
        </button>
        <button
          onClick={() => decline.mutate(request.id)}
          disabled={busy}
          className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
```

---

### `src/components/friends/UserSearchBar.tsx`

```tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { socialApi } from '../../api/social';
import { useSendFriendRequest } from '../../hooks/useFriendRequests';

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function UserSearchBar() {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const debouncedInput = useDebounce(input, 300);
  const sendRequest = useSendFriendRequest();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['userSearch', debouncedInput],
    queryFn: () => socialApi.searchUsers(debouncedInput),
    enabled: debouncedInput.trim().length >= 2,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSend = useCallback(
    (addresseeId: string) => {
      sendRequest.mutate(addresseeId, {
        onSuccess: () => setSentIds((prev) => new Set([...prev, addresseeId])),
      });
    },
    [sendRequest],
  );

  const users = data?.users ?? [];

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        placeholder="Search players by username..."
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && users.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {users.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
              <img
                src={user.avatar ?? '/default-avatar.png'}
                alt={user.username}
                className="w-8 h-8 rounded-full object-cover"
              />
              <span className="flex-1 text-sm">{user.username}</span>
              {user.isFriend ? (
                <span className="text-xs text-green-600 font-medium">Friends</span>
              ) : sentIds.has(user.id) || user.hasPendingRequest ? (
                <span className="text-xs text-gray-500">Request Sent</span>
              ) : (
                <button
                  onClick={() => handleSend(user.id)}
                  disabled={sendRequest.isPending}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
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

---

### `src/components/feed/FeedItem.tsx`

```tsx
import React from 'react';
import type { FeedEntryDto } from '../../types/social';

const VERB: Record<FeedEntryDto['type'], string> = {
  GAME_WON: 'won a game against',
  GAME_LOST: 'lost a game against',
  GAME_DRAWN: 'drew a game against',
  GAME_STARTED: 'started a game against',
  PUZZLE_SOLVED: 'solved puzzle',
  ACHIEVEMENT: 'unlocked',
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FeedItem({ entry }: { entry: FeedEntryDto }) {
  const ratingChange = entry.metadata?.ratingChange as number | undefined;

  return (
    <article className="flex gap-3 p-4 bg-white rounded-lg shadow-sm border">
      <img
        src={entry.actorAvatar ?? '/default-avatar.png'}
        alt={entry.actorUsername}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{entry.actorUsername}</span>{' '}
          <span className="text-gray-600">{VERB[entry.type] ?? entry.type}</span>{' '}
          {entry.targetName && (
            <span className="font-medium">{entry.targetName}</span>
          )}
          {ratingChange !== undefined && (
            <span
              className={`ml-2 text-xs font-bold ${
                ratingChange >= 0 ? 'text-green-600' : 'text-red-500'
              }`}
            >
              {ratingChange >= 0 ? `+${ratingChange}` : String(ratingChange)}
            </span>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-1">{timeAgo(entry.createdAt)}</p>
      </div>
    </article>
  );
}
```

---

### `src/pages/FriendsPage.tsx`

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
  const [tab, setTab] = useState<Tab>('friends');
  const { friends, total, isLoading } = useFriends();
  const { data: reqData } = useIncomingRequests();
  const pendingCount = useSocialStore((s) => s.pendingRequestCount);

  const incoming = reqData?.requests ?? [];

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-5">Friends</h1>

      <UserSearchBar />

      <nav className="flex border-b mt-5 mb-4">
        {(['friends', 'requests'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'friends' ? `Friends (${total})` : (
              <span className="flex items-center gap-1.5">
                Requests
                {pendingCount > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1">
                    {pendingCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'friends' && (
        <section className="space-y-2">
          {isLoading && <p className="text-sm text-gray-500">Loading friends...</p>}
          {!isLoading && friends.length === 0 && (
            <p className="text-sm text-gray-500">No friends yet. Search for players above to add them!</p>
          )}
          {friends.map((f) => <FriendCard key={f.id} friend={f} />)}
        </section>
      )}

      {tab === 'requests' && (
        <section className="space-y-2">
          {incoming.length === 0 && (
            <p className="text-sm text-gray-500">No pending friend requests.</p>
          )}
          {incoming.map((r) => <FriendRequestCard key={r.id} request={r} />)}
        </section>
      )}
    </main>
  );
}
```

---

### `src/pages/ActivityFeedPage.tsx`

```tsx
import React from 'react';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { FeedItem } from '../components/feed/FeedItem';

export function ActivityFeedPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityFeed();
  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <main className="max-w-lg mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-5">Activity Feed</h1>

      {isLoading && <p className="text-sm text-gray-500">Loading feed...</p>}

      {!isLoading && entries.length === 0 && (
        <p className="text-sm text-gray-500">
          Nothing here yet. Add friends to see their activity!
        </p>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <FeedItem key={entry.id} entry={entry} />
        ))}
      </div>

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full mt-5 py-2.5 text-sm font-medium text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
        >
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}
    </main>
  );
}
```

---

### Router Update

In your router configuration file, add:

```tsx
import { FriendsPage } from './pages/FriendsPage';
import { ActivityFeedPage } from './pages/ActivityFeedPage';

// Inside your <Routes> or router config:
<Route path="/friends" element={<FriendsPage />} />
<Route path="/feed" element={<ActivityFeedPage />} />
```

---

### App.tsx / Authenticated Layout Update

Call `usePresence()` once inside your authenticated layout or root `App` component:

```tsx
import { usePresence } from './hooks/usePresence';

// Inside your AuthenticatedLayout component:
export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  usePresence(); // Establishes /presence socket for the session
  return <>{children}</>;
}
```

---

## Verification Checklist

After completing the implementation, verify these manually:

1. **`/friends` page loads** — friends list renders; search bar is present
2. **User search** — typing 2+ characters shows a dropdown within ~300ms; clicking "Add Friend" shows "Request Sent"
3. **Friend requests** — "Requests" tab shows incoming requests with Accept/Decline buttons; Accept updates both lists
4. **Online indicators** — green dot appears on a friend's card when they open the app; gray dot when they close the tab
5. **Heartbeat** — DevTools → Network → WS → filter `heartbeat` — should appear every ~25 seconds
6. **`/feed` page loads** — activity entries render; "Load More" works
7. **TypeScript** — `npm run build` produces zero type errors
8. **No memory leaks** — socket is disconnected and interval cleared when navigating away from the authenticated layout (check DevTools → Console → no warnings on hot reload)
