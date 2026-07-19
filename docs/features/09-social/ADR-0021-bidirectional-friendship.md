# ADR-0021 — Bidirectional Friendship via Single Row + OR Query

## Status

Accepted

## Context

A friendship between two users is a symmetric relationship: if Alice is friends with Bob, Bob is friends with Alice. There are two common storage patterns for this:

**Option A — Two rows (mirrored):** When Alice sends Bob a request that Bob accepts, write two rows: `(requesterId=Alice, addresseeId=Bob, status=ACCEPTED)` and `(requesterId=Bob, addresseeId=Alice, status=ACCEPTED)`. Reads for `WHERE requesterId = $userId AND status = 'ACCEPTED'` are simple. Writes and deletes are doubled. Keeping both rows in sync requires a transaction on every status change.

**Option B — One row + OR query:** Write exactly one row per friendship pair. The row always has `requesterId` = the person who sent the request and `addresseeId` = the person who received it. To query all friends of a user, use:
```sql
WHERE (requesterId = $userId OR addresseeId = $userId) AND status = 'ACCEPTED'
```
Then extract "the other user" from each row at the application layer. Writes and deletes touch exactly one row. No transaction needed to keep two rows in sync.

At ChessWeb's target scale (11M+ users), the Friendship table could have tens of millions of rows. Doubling the row count with Option A imposes unnecessary storage cost and complicates writes.

Alternative evaluated: a separate `friends` join table with two foreign keys and no direction information. This loses the request direction (who sent it), which is required by the accept/decline workflow and the `GET /friends/requests/outgoing` endpoint.

## Decision

Use **Option B: one row per friendship pair**, with the request originator always stored as `requesterId` and the recipient always stored as `addresseeId`. Bidirectionality is achieved by querying both columns simultaneously with an OR clause at the application layer.

Two PostgreSQL indexes support this efficiently:
```sql
@@index([requesterId])   -- queries for outgoing requests
@@index([addresseeId])   -- queries for incoming requests
```

The `@@unique([requesterId, addresseeId])` constraint prevents duplicate requests in the same direction. The service layer additionally checks for existing rows in either direction before inserting, to prevent the reverse-direction duplicate (e.g., Bob trying to send a request to Alice after Alice already sent one to Bob).

`FriendshipService.getFriendIds(userId)` — used by the activity feed and presence notification paths — executes this OR query and maps each row to the other user's ID:

```typescript
const friendships = await this.prisma.friendship.findMany({
  where: {
    OR: [
      { requesterId: userId, status: 'ACCEPTED' },
      { addresseeId: userId, status: 'ACCEPTED' },
    ],
  },
  select: { requesterId: true, addresseeId: true },
});
return friendships.map(f =>
  f.requesterId === userId ? f.addresseeId : f.requesterId
);
```

## Consequences

**Positive:**
- Half the rows compared to the mirrored approach — lower storage and index size at scale.
- Status changes (accept, decline, block) touch exactly one row — no transaction needed for synchronization.
- The `@@unique([requesterId, addresseeId])` constraint serves double duty as a uniqueness guard and a tombstone for declined/blocked relationships.
- The request direction is preserved, enabling incoming/outgoing request endpoints and proper accept/decline authorization (only the addressee can accept).

**Negative:**
- All friend-list queries require an OR clause, which cannot use a single index efficiently. Mitigated by the two separate single-column indexes on `requesterId` and `addresseeId`; PostgreSQL's bitmap OR index scan handles this at acceptable cost.
- Application code must always extract "the other user" from each row by comparing `requesterId` to `userId`. This is a minor but non-zero complexity cost in `FriendshipService`.
- Bulk lookups for "does a friendship exist between user A and user B?" require querying both orderings:
  ```sql
  WHERE (requesterId = A AND addresseeId = B) OR (requesterId = B AND addresseeId = A)
  ```
  This is handled in `FriendshipService.findBetween(userA, userB)` and is called on user search enrichment.
