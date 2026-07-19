# Feature 09 — Social: Increment 1 Implementation Plan

## Scope

Add the `Friendship` and `Follow` Prisma models to `schema.prisma`, add the two required relation arrays to the `User` model, and run a Prisma migration to create the corresponding PostgreSQL tables. No service logic or API endpoints are included in this increment — the goal is purely to get the data model in place so subsequent increments can write service code against a stable schema.

## Files Created / Modified

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Modified — add `Friendship` model, `Follow` model, `FriendshipStatus` enum, and two relation fields on `User` |
| `prisma/migrations/<timestamp>_add_friendship_follow/migration.sql` | Created automatically by `prisma migrate dev` |

## Steps

### Step 1: Update `prisma/schema.prisma`

Add the `FriendshipStatus` enum:

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}
```

Add the `Friendship` model:

```prisma
model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  requester   User             @relation("FriendshipRequester", fields: [requesterId], references: [id])
  addressee   User             @relation("FriendshipAddressee", fields: [addresseeId], references: [id])

  @@unique([requesterId, addresseeId])
  @@index([requesterId])
  @@index([addresseeId])
}
```

Add the `Follow` model:

```prisma
model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("UserFollowing", fields: [followerId], references: [id])
  following   User     @relation("UserFollowers", fields: [followingId], references: [id])

  @@id([followerId, followingId])
  @@index([followingId])
}
```

Add relation fields to the `User` model:

```prisma
model User {
  // ... existing fields ...
  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
  following              Follow[]     @relation("UserFollowing")
  followers              Follow[]     @relation("UserFollowers")
}
```

### Step 2: Run the migration

```bash
npx prisma migrate dev --name add_friendship_follow
npx prisma generate
```

### Step 3: Verify

```bash
npx prisma studio
# or
psql $DATABASE_URL -c "\d \"Friendship\""
psql $DATABASE_URL -c "\d \"Follow\""
```

Confirm:
- `Friendship` table exists with columns: `id`, `requesterId`, `addresseeId`, `status`, `createdAt`, `updatedAt`
- Unique constraint on `(requesterId, addresseeId)`
- Indexes on `requesterId` and `addresseeId`
- `Follow` table exists with composite primary key `(followerId, followingId)`

## Acceptance Criteria

- [ ] `Friendship` table exists in PostgreSQL with correct columns and constraints
- [ ] `Follow` table exists in PostgreSQL with composite PK
- [ ] `FriendshipStatus` enum exists in PostgreSQL with values: PENDING, ACCEPTED, DECLINED, BLOCKED
- [ ] `prisma generate` runs without errors
- [ ] Existing tests (other features) still pass after schema change
- [ ] `User` model compiles without Prisma relation errors

## Complexity

**S** — Pure schema change with no business logic. Only risk is a conflict with existing User model relations if other features have already added relation fields with the same names.
