# 01-Auth — Domain Model

## Entities

```typescript
// Prisma schema snippet

model User {
  id           String         @id @default(uuid())
  username     String         @unique
  email        String         @unique
  passwordHash String
  rating       Int            @default(1200)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  refreshTokens RefreshToken[]
  games        Game[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique        // SHA-256 of the raw token
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  revoked   Boolean  @default(false)

  @@index([userId])
}
```

## TypeScript interfaces

```typescript
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  rating: number;
  createdAt: Date;
}

export interface JwtPayload {
  sub: string;       // userId
  username: string;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
```

## Business rules and invariants

1. **Email uniqueness**: No two users may share the same email address. Enforced by DB unique constraint and caught at service level to return 409 before Prisma throws.
2. **Username uniqueness**: Same as email. Username is 3-20 characters, alphanumeric + underscores only.
3. **Password storage**: Raw passwords are never stored or logged. Only bcrypt hash at cost 10 is persisted.
4. **Refresh token storage**: Raw refresh token is never stored. SHA-256 hash of the token is stored in `tokenHash`. The raw token is returned to the client once and never retrievable again.
5. **Token rotation**: Every call to /auth/refresh invalidates the presented refresh token and issues a new one. The old `RefreshToken` row is deleted (not just revoked) to keep the table lean.
6. **Cascade delete**: Deleting a User cascades and deletes all their RefreshToken rows.
7. **Expiry enforcement**: RefreshToken.expiresAt is checked in application code. Tokens older than 7 days are rejected even if the row still exists.
8. **Default rating**: New users start at ELO 1200 (Glicko-2 is applied on the first rated game).

## Relationships

- User 1 --- N RefreshToken (a user can be logged in from multiple devices)
- User 1 --- N Game (established by game-engine feature)
