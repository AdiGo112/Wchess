# 01-Auth — Backend Implementation Prompt

Copy and paste the following prompt to an AI coding assistant to implement the NestJS auth backend.

---

You are implementing the authentication backend for ChessWeb, a NestJS application with PostgreSQL (via Prisma) and Redis. The project uses TypeScript throughout.

## Project structure (what already exists)
- `backend/src/app.module.ts` — root module, imports PrismaModule
- `backend/src/prisma/prisma.service.ts` — PrismaService (injectable)
- `backend/prisma/schema.prisma` — existing schema with no User model yet
- NestJS 10, Prisma 5, passport, @nestjs/jwt, @nestjs/passport are installed

## Task: Implement the complete auth backend

### Step 1: Prisma schema

Add to `backend/prisma/schema.prisma`:

```prisma
model User {
  id            String         @id @default(uuid())
  username      String         @unique
  email         String         @unique
  passwordHash  String
  rating        Int            @default(1200)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
  revoked   Boolean  @default(false)

  @@index([userId])
}
```

Run `npx prisma migrate dev --name init-auth`.

### Step 2: DTOs

Create `backend/src/auth/dto/register.dto.ts`:
- username: string, @IsString, @MinLength(3), @MaxLength(20), @Matches(/^[a-zA-Z0-9_]+$/)
- email: string, @IsEmail
- password: string, @IsString, @MinLength(8)

Create `backend/src/auth/dto/login.dto.ts`:
- email: string, @IsEmail
- password: string, @IsString

Create `backend/src/auth/dto/refresh.dto.ts`:
- refreshToken: string, @IsString

### Step 3: JWT payload interface

Create `backend/src/auth/types/jwt-payload.interface.ts`:
```typescript
export interface JwtPayload {
  sub: string;
  username: string;
}
```

### Step 4: Strategies

Create `backend/src/auth/strategies/local.strategy.ts` (passport-local):
- Calls AuthService.validateUser(email, password)
- Throws UnauthorizedException if null returned

Create `backend/src/auth/strategies/jwt.strategy.ts` (passport-jwt):
- Reads JWT_SECRET from ConfigService
- Extracts from Bearer header
- Returns { userId: payload.sub, username: payload.username }

### Step 5: Guards

Create `backend/src/auth/guards/jwt-auth.guard.ts` — extends AuthGuard('jwt')
Create `backend/src/auth/guards/local-auth.guard.ts` — extends AuthGuard('local')

### Step 6: AuthService

Create `backend/src/auth/auth.service.ts` with these methods:

```typescript
async register(dto: RegisterDto): Promise<{ user: UserProfile }>
async validateUser(email: string, password: string): Promise<User | null>
async login(user: User): Promise<AuthTokens & { user: UserProfile }>
async refresh(dto: RefreshDto): Promise<AuthTokens>
async logout(userId: string): Promise<void>
async getMe(userId: string): Promise<UserProfile>
```

Key implementation details:
- register: check email uniqueness (throw ConflictException with code EMAIL_ALREADY_EXISTS), check username uniqueness (USERNAME_ALREADY_EXISTS), hash password with bcrypt.hash(password, 10), create user
- login: generate accessToken with JwtService.sign({ sub: user.id, username: user.username }, { expiresIn: '15m' }); generate rawRefreshToken with crypto.randomBytes(64).toString('hex'); store SHA-256 hash of raw token in RefreshToken table
- refresh: hash presented token, find by tokenHash, check expiresAt > now, delete old row, issue new tokens
- logout: deleteMany RefreshToken where userId = userId

### Step 7: AuthController

Create `backend/src/auth/auth.controller.ts`:

```
POST /auth/register  — @UseGuards() none, calls authService.register(dto)
POST /auth/login     — @UseGuards(LocalAuthGuard), calls authService.login(req.user)
POST /auth/refresh   — @UseGuards() none, calls authService.refresh(dto)
POST /auth/logout    — @UseGuards(JwtAuthGuard), calls authService.logout(req.user.userId)
GET  /auth/me        — @UseGuards(JwtAuthGuard), calls authService.getMe(req.user.userId)
```

### Step 8: AuthModule

Create `backend/src/auth/auth.module.ts`:
- Imports PrismaModule, PassportModule, JwtModule.registerAsync (reads JWT_SECRET from ConfigService)
- Provides AuthService, LocalStrategy, JwtStrategy
- Exports JwtModule, JwtAuthGuard (for use in other modules)

### Step 9: Register AuthModule in AppModule

Add AuthModule to imports in `backend/src/app.module.ts`.

### Environment variables required
- JWT_SECRET — string, minimum 32 characters
- DATABASE_URL — PostgreSQL connection string

### Error handling
All ConflictExceptions should include a JSON body: `{ statusCode: 409, message: "...", code: "EMAIL_ALREADY_EXISTS" }`.
All UnauthorizedExceptions should include: `{ statusCode: 401, message: "...", code: "INVALID_CREDENTIALS" | "TOKEN_EXPIRED" | "REFRESH_TOKEN_INVALID" }`.
