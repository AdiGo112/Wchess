# ADR-0022 — Redis TTL Keys for Online Presence

## Status

Accepted

## Context

ChessWeb needs to track which users are currently online and notify their friends in real time when they come online or go offline. Several approaches were considered:

**Option A — Track by WebSocket connection state only:** A user is online if they have at least one active Socket.io connection. Presence is stored purely in-memory in the NestJS process (a `Map<userId, Set<socketId>>`). No Redis involved.

This breaks under horizontal scaling: if User A is connected to server instance 1 and User B is on instance 2, instance 2 has no knowledge of User A's connections. At 11M+ users and multiple NestJS instances behind a load balancer, this does not scale without additional coordination.

**Option B — Redis pub/sub for socket routing only:** Use Redis Adapter for Socket.io (`@socket.io/redis-adapter`) to fan out events across instances, but still track presence in-memory. Same scaling problem for presence queries.

**Option C — Redis TTL keys (chosen):** Each online user has a Redis key `user:{userId}:online` with value `"1"` and a 35-second TTL. The client refreshes the key every 25 seconds via a socket heartbeat. If the client disconnects and stops heartbeating, the key expires automatically. Presence queries use `GET` (single user) or `MGET` (bulk, for friends list). Any NestJS instance can read or write these keys, making the approach stateless and horizontally scalable.

**Option D — PostgreSQL `lastSeen` polling:** Update a `User.lastSeen` timestamp in PostgreSQL on every heartbeat. Query `WHERE lastSeen > NOW() - INTERVAL '35 seconds'` to determine online status. Pros: no additional infrastructure. Cons: high write rate (one UPDATE per online user per 25 seconds) is not appropriate for PostgreSQL at scale; polling latency for "is online" queries degrades under load.

**Option E — Redis keyspace notifications for offline detection:** Subscribe to `__keyevent@0__:expired` events in Redis to detect when a `user:{userId}:online` key expires (TTL-based disconnect). This gives server-push offline detection for ungraceful disconnects. Deferred: adds complexity (must configure `CONFIG SET notify-keyspace-events KEx`) and is not required for launch. Graceful disconnects are handled by `handleDisconnect` clearing the key immediately.

## Decision

Use **Option C: Redis TTL keys**. Each user's online status is represented by a single key `user:{userId}:online = "1" EX 35` in Redis. The key lifecycle is:

| Event | Redis operation |
|---|---|
| User connects to /presence | `SET user:{id}:online "1" EX 35` |
| Client emits heartbeat (every 25s) | `SET user:{id}:online "1" EX 35` (refreshes TTL) |
| User disconnects gracefully | `DEL user:{id}:online` |
| User disconnects ungracefully | Key expires after 35s (no explicit operation) |

Bulk presence lookup for the friends list uses `Promise.all` over individual `GET` calls rather than `MGET` to keep the implementation simple; this can be replaced with `MGET` if the Redis round-trip count becomes a bottleneck.

The 10-second gap between heartbeat interval (25s) and TTL (35s) provides a buffer for transient network jitter: a client that misses one heartbeat due to a brief blip will not appear offline.

The `PresenceService` is a singleton injected into both `PresenceGateway` (for connect/disconnect/heartbeat) and `FriendshipService` (for online status enrichment in `GET /friends`).

## Consequences

**Positive:**
- Stateless and horizontally scalable: any NestJS instance can read/write presence keys.
- Automatic cleanup: ungraceful disconnects are handled by TTL expiry with no cron job.
- Bulk reads are O(n) Redis GETs — fast and predictable.
- Redis is already a project dependency (used for session caching in Auth); no new infrastructure required.
- Simple key schema: trivial to inspect, debug, and manually clear in staging.

**Negative:**
- Eventual consistency: an ungracefully disconnected user remains "online" for up to 35 seconds. This is a known and acceptable trade-off for this use case — presence is a best-effort signal, not a guarantee.
- No server-push offline notification on TTL expiry: friends are not notified via `friend_offline` when a TTL-based disconnect occurs. They will see the correct offline status on next page load or `GET /friends` call. Redis keyspace notifications (Option E) can be added in a future increment to close this gap.
- If Redis is unavailable, presence is fully degraded: all users appear offline. The application continues to function (friendships and feed still work) but presence indicators are dark. This is acceptable for a non-critical feature.
- Memory cost: one Redis key per online user. At 11M users with a 1% concurrent online rate, this is ~110,000 keys × ~50 bytes ≈ 5.5 MB — negligible.
