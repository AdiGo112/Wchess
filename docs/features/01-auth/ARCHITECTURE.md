# 01-Auth — Architecture

## Service map

```
Browser (React)
    |
    | HTTPS
    v
NestJS API (AuthModule)
    |--- AuthController  (HTTP routes)
    |--- AuthService     (business logic)
    |--- JwtStrategy     (passport JWT verification)
    |--- LocalStrategy   (passport local login)
    |
    |--- PrismaService ---> PostgreSQL
         |-- User table
         |-- RefreshToken table
```

## Data flow: login

```
1. Client POST /auth/login { email, password }
2. LocalStrategy calls AuthService.validateUser(email, password)
3. AuthService fetches User from PostgreSQL via Prisma
4. bcrypt.compare(password, user.passwordHash)
5. AuthService.login(user) generates:
   a. accessToken  = JWT signed with JWT_SECRET, exp 15m
   b. refreshToken = crypto.randomBytes(64).toString('hex')
6. RefreshToken row inserted in PostgreSQL (hashed token, userId, expiresAt = 7d)
7. Response: { accessToken, refreshToken, user: { id, username, email, rating } }
```

## Data flow: authenticated request

```
1. Client sets Authorization: Bearer <accessToken>
2. JwtStrategy.validate() decodes JWT (no DB hit)
3. Payload { sub: userId, username } injected as req.user
4. Controller handler executes
```

## Data flow: token refresh

```
1. Client POST /auth/refresh { refreshToken }
2. AuthService finds RefreshToken row in PostgreSQL
3. Validates: not expired, not revoked
4. Deletes old RefreshToken row (rotation)
5. Issues new accessToken + new refreshToken
6. Inserts new RefreshToken row
```

## Backend file tree

```
backend/src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.service.spec.ts
├── strategies/
│   ├── jwt.strategy.ts
│   └── local.strategy.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   └── local-auth.guard.ts
├── dto/
│   ├── register.dto.ts
│   ├── login.dto.ts
│   └── refresh.dto.ts
└── types/
    └── jwt-payload.interface.ts

backend/prisma/schema.prisma   (User + RefreshToken models)
```

## Database assignment

| Entity       | Store      | Reason                                      |
|--------------|------------|---------------------------------------------|
| User         | PostgreSQL | Relational, durable, ACID-compliant         |
| RefreshToken | PostgreSQL | Durability required; revocation is critical |
| JWT payload  | In-memory  | Stateless; no storage needed                |
