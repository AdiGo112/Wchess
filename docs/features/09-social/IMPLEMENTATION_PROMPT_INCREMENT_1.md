# Feature 09 — Social: Increment 1 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 1 of the Social feature for ChessWeb, a NestJS 10 + React chess platform.

**Increment 1 goal**: Add `Friendship` and `Follow` Prisma models to `schema.prisma` and run a migration to create the PostgreSQL tables.

## Existing Codebase State

- NestJS 10 backend with Prisma ORM connected to PostgreSQL
- `prisma/schema.prisma` already has a `User` model with at minimum: `id String @id @default(cuid())`, `username String @unique`, `email String @unique`, and `createdAt DateTime @default(now())`
- No social-related models exist yet

## Step 1: Update `prisma/schema.prisma`

Add the following to `prisma/schema.prisma`. Place the enum before the Friendship model, and the models after the User model.

### Add the FriendshipStatus enum

```prisma
enum FriendshipStatus {
  PENDING
  ACCEPTED
  DECLINED
  BLOCKED
}
```

### Add the Friendship model

```prisma
model Friendship {
  id          String           @id @default(cuid())
  requesterId String
  addresseeId String
  status      FriendshipStatus @default(PENDING)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  requester   User             @relation("FriendshipRequester", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User             @relation("FriendshipAddressee", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([requesterId])
  @@index([addresseeId])
}
```

### Add the Follow model

```prisma
model Follow {
  followerId  String
  followingId String
  createdAt   DateTime @default(now())
  follower    User     @relation("UserFollowing", fields: [followerId], references: [id], onDelete: Cascade)
  following   User     @relation("UserFollowers", fields: [followingId], references: [id], onDelete: Cascade)

  @@id([followerId, followingId])
  @@index([followingId])
}
```

### Add relation fields to the User model

Find the `model User` block and add these four fields inside it (before the closing `}`):

```prisma
  sentFriendRequests     Friendship[] @relation("FriendshipRequester")
  receivedFriendRequests Friendship[] @relation("FriendshipAddressee")
  following              Follow[]     @relation("UserFollowing")
  followers              Follow[]     @relation("UserFollowers")
```

## Step 2: Run the migration

```bash
npx prisma migrate dev --name add_friendship_follow
npx prisma generate
```

## Step 3: Verify the migration

Run these SQL queries against your PostgreSQL database to verify the tables were created correctly:

```sql
-- Verify Friendship table
\d "Friendship"

-- Verify Follow table
\d "Follow"

-- Verify FriendshipStatus enum
SELECT enum_range(NULL::"FriendshipStatus");

-- Verify unique constraint
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'Friendship';

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'Friendship';
```

Expected: `Friendship` has columns id, requesterId, addresseeId, status, createdAt, updatedAt with a UNIQUE constraint on (requesterId, addresseeId) and single-column indexes on requesterId and addresseeId.

## Step 4: Confirm TypeScript compiles

```bash
npx tsc --noEmit
```

No errors should be reported related to Prisma types. The generated Prisma client should now include `PrismaClient.friendship` and `PrismaClient.follow`.

## Verification

```bash
# Check migration file was created
ls prisma/migrations/

# Check Prisma client was generated with new types
grep -r "friendship" node_modules/.prisma/client/index.d.ts | head -5
```

## What NOT to do in this increment

- Do not create any NestJS service, controller, or module files
- Do not add any API endpoints
- Do not install any new npm packages (Prisma is already installed)

## Output

Confirm:
1. The exact diff to `prisma/schema.prisma`
2. The contents of the generated migration SQL file
3. That `npx prisma generate` and `npx tsc --noEmit` both succeed
