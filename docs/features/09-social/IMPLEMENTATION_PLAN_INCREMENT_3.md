# Feature 09 — Social: Increment 3 Implementation Plan

## Scope

Implement the `PresenceModule` with `PresenceService` (Redis TTL key management) and `PresenceGateway` (Socket.io `/presence` namespace). The gateway handles connect, disconnect, and heartbeat events; emits `friend_online` and `friend_offline` to friends' connected sockets; and tracks a socket-to-user mapping in memory for multi-tab support. After this increment, `GET /friends` returns live `isOnline` values and the frontend presence indicators work. Unit tests for `PresenceService` are also written.

## Files Created / Modified

| File | Action |
|------|--------|
| `src/presence/presence.module.ts` | Created |
| `src/presence/presence.service.ts` | Created |
| `src/presence/presence.gateway.ts` | Created |
| `src/presence/presence.service.spec.ts` | Created |
| `src/friendships/friendships.module.ts` | Modified — import `PresenceModule` (replaces stub) |
| `src/app.module.ts` | Modified — import `PresenceModule` |

## Steps

### Step 1: Create `PresenceService`

Redis key schema: `user:{userId}:online`

```typescript
setOnline(userId: string): Promise<void>    // SET key "1" EX 35
setOffline(userId: string): Promise<void>   // DEL key
isOnline(userId: string): Promise<boolean>  // GET key !== null
getOnlineStatus(userIds: string[]): Promise<boolean[]> // Promise.all GET
```

Inject the Redis client via `@Inject('REDIS_CLIENT')`. The `RedisModule` provides the client token.

### Step 2: Create `PresenceGateway`

```typescript
@WebSocketGateway({ namespace: '/presence', cors: { origin: '*' } })
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // socketToUser: Map<socketId, userId>
  // userToSockets: Map<userId, Set<socketId>>

  handleConnection(client: Socket)     // validate JWT, setOnline, notify friends
  handleDisconnect(client: Socket)     // setOffline if last socket, notify friends
  @SubscribeMessage('heartbeat')
  handleHeartbeat(client: Socket)      // setOnline (refresh TTL)
}
```

Multi-tab handling: A user is considered online as long as `userToSockets.get(userId).size > 0`. Only call `setOffline` and emit `friend_offline` when the set becomes empty on disconnect.

JWT validation in `handleConnection`: read `client.handshake.auth.token`, verify with `JwtService`. On invalid token, call `client.disconnect(true)`.

Friend notification: call `FriendshipService.getFriendIds(userId)` to get friends, then for each friend look up their socket IDs in `userToSockets` and emit `friend_online` / `friend_offline`.

### Step 3: Module wiring

`PresenceModule` imports `RedisModule`, provides `PresenceService` and `PresenceGateway`, and **exports `PresenceService`** so `FriendshipsModule` can inject it.

`FriendshipsModule` imports `PresenceModule` (remove the stub). `FriendshipsModule` must also be importable by `PresenceModule` (for `getFriendIds`) — use `forwardRef()` to break the circular dependency:

```typescript
// presence.module.ts
imports: [RedisModule, forwardRef(() => FriendshipsModule)]

// friendships.module.ts
imports: [PrismaModule, forwardRef(() => PresenceModule)]
```

### Step 4: Write unit tests for `PresenceService`

See `AUTOMATED_TESTING_STRATEGY.md` for test cases.

## Acceptance Criteria

- [ ] Connecting to `/presence` with a valid JWT sets `user:{id}:online` in Redis with TTL 35s
- [ ] Emitting `heartbeat` refreshes the TTL (verify with `redis-cli TTL user:{id}:online` before and after)
- [ ] Disconnecting gracefully DELetes the Redis key immediately
- [ ] `GET /social/friends` returns `isOnline: true` for a friend who is connected
- [ ] A second browser tab: connecting both tabs keeps user online; closing one tab does not trigger `friend_offline`; closing both tabs triggers `friend_offline`
- [ ] `friend_online` event received by friend's socket when user connects
- [ ] `friend_offline` event received by friend's socket when user disconnects
- [ ] Connecting with an invalid JWT results in immediate socket disconnect
- [ ] Unit tests for `PresenceService` pass

## Complexity

**M** — The gateway's multi-tab socket tracking (two complementary Maps) and the circular dependency between `FriendshipsModule` and `PresenceModule` require care. JWT validation in the WebSocket handshake is slightly different from HTTP guards and needs to be done inline in `handleConnection`.
