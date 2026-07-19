# 03-Matchmaking — Domain Model

## Entities

```prisma
model Challenge {
  id          String   @id @default(uuid())
  token       String   @unique  // 16-byte random hex used in share URL
  creatorId   String
  creator     User     @relation(fields: [creatorId], references: [id])
  variant     String
  timeControl Int
  increment   Int      @default(0)
  creatorColor String  @default("random")  // 'white' | 'black' | 'random'
  status      String   @default("pending") // 'pending' | 'accepted' | 'expired'
  gameId      String?  // set when accepted
  expiresAt   DateTime
  createdAt   DateTime @default(now())

  @@index([creatorId])
}
```

## TypeScript interfaces

```typescript
export interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  socketId: string;
  enqueuedAt: number;  // Date.now()
  variant: string;
  timeControl: number;
  increment: number;
}

export interface MatchResult {
  gameId: string;
  whiteId: string;
  blackId: string;
  variant: string;
  timeControl: number;
  increment: number;
}
```

## Business rules

1. A player can only be in one queue at a time. Joining a second queue auto-leaves the first.
2. Rating tolerance starts at ±50 and expands by 12 per second of waiting, capping at ±400 after 30 seconds.
3. Friend challenge tokens expire after 10 minutes. Expired tokens return 404.
4. A player cannot accept their own challenge (CANNOT_ACCEPT_OWN_CHALLENGE).
5. Color assignment: if creatorColor is 'white', creator plays white; 'black', creator plays black; 'random', randomly assigned.
6. Computer games are created immediately (no queue). Difficulty 1=depth1, 2=depth3, 3=depth5, 4=depth10, 5=depth15.
7. When a match is found, both players are removed from the queue before game room creation to prevent double-matching.
