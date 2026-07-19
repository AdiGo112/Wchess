# 09-Social — Domain Model

## Entities

### Friendship

The core entity representing a relationship between two users.

```
Friendship {
  id          : string (cuid)           — surrogate key
  requesterId : string                  — FK to User; the person who initiated
  addresseeId : string                  — FK to User; the person who received the request
  status      : FriendshipStatus        — current state of the relationship
  createdAt   : DateTime                — when the request was sent
  updatedAt   : DateTime                — when status last changed
}

Constraint: @@unique([requesterId, addresseeId])
  → only one row per ordered (requester, addressee) pair
  → prevents duplicate requests in the same direction
  → a declined/blocked row acts as a tombstone preventing re-request
```

**What Friendship does NOT own:**
- User data (username, avatar) — belongs to the User entity, joined on read
- Presence state — lives in Redis, not PostgreSQL

---

### ActivityFeedEntry (MongoDB Document)

A denormalized event record written to MongoDB. Denormalization is intentional: actor username is stored inline so feed reads require no JOIN.

```
ActivityFeedEntry {
  _id          : ObjectId              — used as pagination cursor
  actorId      : string                — userId of the actor
  actorUsername: string                — denormalized username at time of event
  type         : ActivityType          — what happened
  targetId     : string | null         — gameId, puzzleId, or achievementId
  targetName   : string | null         — human-readable name of the target
  metadata     : object                — type-specific payload
  createdAt    : Date                  — used by TTL index (expireAfterSeconds: 2592000)
}
```

**Metadata by type:**

| ActivityType | metadata fields |
|---|---|
| `GAME_STARTED` | `{ opponent: string, timeControl: string }` |
| `GAME_WON` | `{ opponent: string, timeControl: string, ratingChange: number }` |
| `GAME_LOST` | `{ opponent: string, timeControl: string, ratingChange: number }` |
| `GAME_DRAWN` | `{ opponent: string, timeControl: string, ratingChange: number }` |
| `PUZZLE_SOLVED` | `{ difficulty: string, timeMs: number }` |
| `ACHIEVEMENT` | `{ achievementKey: string, description: string }` |

---

### User (referenced, not owned here)

The User entity is owned by the Auth feature (01-auth). The Social feature references `userId` from the JWT and uses Prisma to join User data when returning friend lists.

---

## Value Objects

### FriendshipStatus

```typescript
enum FriendshipStatus {
  PENDING   // request sent, not yet acted on
  ACCEPTED  // both parties are friends
  DECLINED  // addressee declined; row kept to prevent re-spam
  BLOCKED   // blocker set this; blocked user cannot send new requests
}
```

State transitions:

```
PENDING → ACCEPTED   (addressee accepts)
PENDING → DECLINED   (addressee declines)
PENDING → BLOCKED    (either party blocks)
ACCEPTED → BLOCKED   (either party blocks an existing friend)
ACCEPTED → [deleted] (either party unfriends)
DECLINED → [deleted] (if user search allows re-request after some time — future feature)
```

Currently, `DECLINED` rows are kept permanently to act as spam guards. A future feature could allow re-requesting after 7 days.

### ActivityType

```typescript
enum ActivityType {
  GAME_STARTED  = 'GAME_STARTED',
  GAME_WON      = 'GAME_WON',
  GAME_LOST     = 'GAME_LOST',
  GAME_DRAWN    = 'GAME_DRAWN',
  PUZZLE_SOLVED = 'PUZZLE_SOLVED',
  ACHIEVEMENT   = 'ACHIEVEMENT',
}
```

### PresenceState

Not a persistent entity — computed on each request from Redis.

```typescript
interface PresenceState {
  isOnline: boolean;   // Redis key user:{id}:online exists
  lastSeen: Date | null; // from User.lastSeen (PostgreSQL), updated on disconnect
}
```

---

## Business Rules

### Friendship Rules

1. **No self-friendship.** `requesterId !== addresseeId` enforced in `FriendshipService.sendRequest()` before any DB write. Returns HTTP 400.

2. **No duplicate requests.** The `@@unique([requesterId, addresseeId])` constraint at the DB level enforces uniqueness. Service catches Prisma `P2002` error and re-throws as HTTP 409. This applies to any existing row regardless of status.

3. **Only addressee can accept or decline.** `FriendshipService.acceptRequest()` and `declineRequest()` check `friendship.addresseeId === currentUserId`. Returns HTTP 403 if not.

4. **BLOCKED prevents future requests.** A BLOCKED row has the same (requesterId, addresseeId) pair as the original request. If the blocked user tries to send a new request, the unique constraint returns 409. If they try from the other direction (as the new requester), the service checks for any BLOCKED row involving both users and returns 403.

5. **Friendship is bidirectional — queried with OR.** `getFriends()` queries:
   ```
   WHERE (requesterId = $userId OR addresseeId = $userId) AND status = 'ACCEPTED'
   ```
   Then extracts "the other user" from each row. This means either user can see the other in their friends list.

6. **BLOCKED is unidirectional.** When user A blocks user B:
   - A sees B as blocked (BLOCKED row visible to A)
   - B's view of the friendship is hidden (service filters out BLOCKED rows where the current user is the blocked party)
   - B cannot re-request (unique constraint prevents it)

7. **Only accepted friends see each other's activity feed entries.** `ActivityFeedService.getFeed(userId)` first fetches accepted friend IDs from `FriendshipService`, then queries MongoDB `actorId IN [friendIds]`.

### Presence Rules

8. **Presence TTL is 35 seconds; client heartbeat interval is 25 seconds.** The 10-second gap absorbs network jitter. A client that misses one heartbeat due to a brief network blip will not appear offline.

9. **Offline detection lag of up to 35 seconds.** If a client disconnects without a graceful close (e.g., browser crash, network loss), the user will appear online until the Redis key expires. This is a known eventual-consistency trade-off documented in ADR-0022.

10. **Graceful disconnect clears the key immediately.** `PresenceGateway.handleDisconnect()` calls `presenceService.setOffline(userId)` which runs `DEL user:{id}:online`, making the user appear offline immediately rather than waiting for TTL expiry.

### Activity Feed Rules

11. **Feed entries expire after 30 days.** MongoDB TTL index on `createdAt` with `expireAfterSeconds: 2592000` handles cleanup automatically. No cron job needed.

12. **Feed entries are visible only to friends of the actor at read time.** Feed entries are not retroactively removed if a friendship ends — but if you unfriend someone, their entries no longer appear in your feed (because `getFeed()` uses the current friends list).

13. **Actor username is denormalized.** If a user changes their username, old feed entries will still show the old username. This is an acceptable trade-off for read performance. Future: background job to update entries on username change.
