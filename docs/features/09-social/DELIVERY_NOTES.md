# 09-Social — Delivery Notes

## Pre-Deployment Checklist

Complete every item in order. Items marked **[BLOCKING]** must be done before the feature goes live.

---

### 1. Database — PostgreSQL Migrations

- [ ] **[BLOCKING]** Run `npx prisma migrate deploy` in the production environment to apply the Friendship and Follow model migrations.
- [ ] Verify the `Friendship` table exists: `SELECT table_name FROM information_schema.tables WHERE table_name = 'Friendship';`
- [ ] Verify the unique constraint exists: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'Friendship' AND constraint_type = 'UNIQUE';`
- [ ] Verify the indexes exist: `SELECT indexname FROM pg_indexes WHERE tablename = 'Friendship';` — expect `Friendship_requesterId_idx` and `Friendship_addresseeId_idx`.
- [ ] Add the `sentFriendRequests` and `receivedFriendRequests` relation fields to the `User` model if not already present and re-run `prisma generate`.

---

### 2. Database — MongoDB TTL Index

- [ ] **[BLOCKING]** Create the TTL index on the `activity_feed` collection **before deploying**. The TTL index must exist before documents are inserted; MongoDB does not backfill TTL for documents inserted before the index exists.

Run on the target MongoDB instance (Atlas or shell):
```javascript
db.activity_feed.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000, name: 'activity_feed_ttl' }
);
```

Verify:
```javascript
db.activity_feed.getIndexes();
// Expect an entry with { key: { createdAt: 1 }, expireAfterSeconds: 2592000 }
```

- [ ] Create the compound query index:
```javascript
db.activity_feed.createIndex(
  { actorId: 1, createdAt: -1 },
  { name: 'activity_feed_actor_created' }
);
```

- [ ] Verify the Mongoose schema TTL index annotation matches the manually created index (both use `expireAfterSeconds: 2592000`). If Mongoose's `autoIndex` is disabled in production (recommended), the index must be created manually as above.

---

### 3. Redis Configuration

- [ ] **[BLOCKING]** Verify the Redis instance has sufficient memory to hold online presence keys. Estimate: `numConcurrentUsers × 50 bytes`. At 1% of 11M = 110,000 keys × 50 bytes ≈ 5.5 MB — well within typical Redis memory limits.
- [ ] If Redis keyspace notifications are desired for TTL-based offline detection (future feature), configure: `CONFIG SET notify-keyspace-events KEx`. Note: this is **not required** for launch — graceful disconnect via `handleDisconnect` is sufficient.
- [ ] Verify the Redis connection string (`REDIS_URL` environment variable) is set in the production environment.
- [ ] Verify Redis `maxmemory-policy` is set to `noeviction` or `volatile-ttl` — do **not** use `allkeys-lru` in production as it may evict presence keys under memory pressure.

---

### 4. Environment Variables

Ensure all of the following are set in the production environment:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (already required by other features) |
| `REDIS_URL` | Redis connection string (e.g., `redis://localhost:6379`) |
| `MONGODB_URI` | MongoDB connection string (e.g., `mongodb+srv://...`) |
| `JWT_SECRET` | Already required by auth feature; social endpoints rely on the same JWT guard |

---

### 5. NestJS Module Registration

- [ ] Verify `FriendshipsModule`, `PresenceModule`, and `ActivityFeedModule` are imported in `AppModule`.
- [ ] Verify `MongooseModule.forFeature([{ name: ActivityFeedEntry.name, schema: ActivityFeedEntrySchema }])` is in `ActivityFeedModule`.
- [ ] Verify `ActivityFeedModule` exports `ActivityFeedService` so `GameModule` and `PuzzlesModule` can inject it.
- [ ] Verify `PresenceModule` exports `PresenceService` so `FriendshipsModule` can inject it.

---

### 6. Socket.io Configuration

- [ ] Verify the Socket.io server is configured with the Redis adapter (`@socket.io/redis-adapter`) if running multiple NestJS instances. Without the Redis adapter, `friend_online` / `friend_offline` events will only reach clients connected to the same instance.
- [ ] Verify CORS is configured on the `/presence` namespace to allow the frontend origin.

---

### 7. Frontend Build

- [ ] Verify `VITE_API_URL` (or equivalent) points to the correct backend URL.
- [ ] Verify `VITE_SOCKET_URL` points to the correct WebSocket server URL.
- [ ] Run `npm run build` and confirm no TypeScript errors in the social components.

---

### 8. Smoke Tests After Deployment

Run these manually or via CI after deploying:

```bash
# 1. Send a friend request (replace TOKEN and USER_ID with real values)
curl -X POST https://api.chessweb.com/social/friends/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"addresseeId": "TARGET_USER_ID"}' \
  | jq .status

# Expected: "PENDING"

# 2. List friends
curl https://api.chessweb.com/social/friends \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.total'

# 3. Get activity feed
curl "https://api.chessweb.com/social/activity-feed?limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.entries | length'
```

---

## Rollback Plan

### If the migration fails

```bash
# Roll back the last Prisma migration
npx prisma migrate resolve --rolled-back <migration_name>
# Then redeploy the previous backend version
```

The Friendship and Follow tables are additive — rolling back removes them and their data. Existing user and game data is unaffected.

### If Redis is unavailable

The Social feature degrades gracefully:
- Friendship CRUD (send/accept/decline/block/unfriend) continues to work — it only uses PostgreSQL.
- `GET /friends` returns friends with `isOnline: false` for all (PresenceService falls back gracefully when Redis throws).
- The `/presence` Socket.io gateway logs errors but does not crash the NestJS process.
- Activity feed is unaffected by Redis.

Ensure `PresenceService.setOnline`, `setOffline`, and `getOnlineStatus` are wrapped in try/catch with graceful fallbacks (return `false` arrays, do not throw).

### If MongoDB is unavailable

- `ActivityFeedService.publish()` is fire-and-forget and catches errors — game completions are not blocked.
- `GET /feed` returns a 503 if MongoDB is completely down. Add a try/catch in `ActivityFeedController` to return `{ entries: [], nextCursor: null, hasMore: false }` as a degraded response.
- Friendship and presence features are unaffected.

### Feature flag

If a feature flag system is available, gate the Social feature behind a flag (e.g., `FEATURE_SOCIAL_ENABLED`). When disabled, return 503 from all `/social` endpoints. This allows instant rollback without a redeployment.

---

## Known Limitations at Launch

1. **No server-push offline event on TTL expiry.** If a user disconnects ungracefully (browser crash), friends see them as online for up to 35 seconds. Redis keyspace notifications can close this gap in a follow-up increment.
2. **Username denormalization in activity feed.** Old feed entries show the username at time of activity, not the current username. Acceptable for launch.
3. **No pagination on friends list.** `GET /friends` returns all accepted friends. Add cursor pagination if users with 1000+ friends become common.
4. **No rate limiting on friend requests.** A malicious user could spam requests to different users. Add a rate limit (e.g., 10 requests per minute per user) in a follow-up.
5. **Follow feature (model exists, no endpoints yet).** The `Follow` Prisma model is in the schema but `FollowService` and its endpoints are not in the initial delivery. Endpoints can be added in a follow-up without a migration.
