# 01-Auth — Implementation Prompt: Increment 1

Copy and paste this entire prompt to an AI coding assistant. It is self-contained.

---

You are implementing Increment 1 of the authentication feature for ChessWeb, a NestJS + PostgreSQL application.

## Current state of the codebase

The following already exists:
- `backend/src/app.module.ts` — root AppModule with PrismaModule imported
- `backend/src/prisma/prisma.service.ts` — PrismaService, injectable
- `backend/prisma/schema.prisma` — empty schema (only datasource and generator blocks)
- `backend/package.json` — includes: @nestjs/core, @nestjs/common, @nestjs/jwt, @nestjs/passport, passport, passport-jwt, passport-local, bcryptjs, class-validator, class-transformer, @prisma/client
- `.env` file exists with DATABASE_URL set

## What you are building in this increment

Register endpoint, login endpoint, bcrypt password hashing, JWT signing, Prisma User + RefreshToken models.

Do NOT implement /auth/refresh or /auth/logout yet — those are Increment 2.

## Step-by-step instructions

### 1. Update Prisma schema

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

After updating, run: `npx prisma migrate dev --name init-auth`

### 2. Create DTOs

`backend/src/auth/dto/register.dto.ts`:
- username: @IsString(), @MinLength(3), @MaxLength(20), @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
- email: @IsEmail()
- password: @IsString(), @MinLength(8)

`backend/src/auth/dto/login.dto.ts`:
- email: @IsEmail()
- password: @IsString()

### 3. Create JWT payload interface

`backend/src/auth/types/jwt-payload.interface.ts`:
```typescript
export interface JwtPayload {
  sub: string;
  username: string;
}
```

### 4. Create LocalStrategy

`backend/src/auth/strategies/local.strategy.ts`:
- Extends PassportStrategy(Strategy) from passport-local
- In constructor: super({ usernameField: 'email' })
- validate(email, password): calls this.authService.validateUser(email, password); throws UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }) if null

### 5. Create JwtStrategy

`backend/src/auth/strategies/jwt.strategy.ts`:
- Extends PassportStrategy(Strategy) from passport-jwt
- In constructor: super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET })
- validate(payload: JwtPayload): returns { userId: payload.sub, username: payload.username }

### 6. Create Guards

`backend/src/auth/guards/local-auth.guard.ts` — extends AuthGuard('local'), no overrides needed
`backend/src/auth/guards/jwt-auth.guard.ts` — extends AuthGuard('jwt'), no overrides needed

### 7. Create AuthService

`backend/src/auth/auth.service.ts`:

```typescript
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // 1. Check email uniqueness
    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existingEmail) throw new ConflictException({ message: 'Email already registered', code: 'EMAIL_ALREADY_EXISTS' });

    // 2. Check username uniqueness
    const existingUsername = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existingUsername) throw new ConflictException({ message: 'Username already taken', code: 'USERNAME_ALREADY_EXISTS' });

    // 3. Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 4. Create user
    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email.toLowerCase(), passwordHash, rating: 1200 },
    });

    return { user: this.toProfile(user) };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }

  async login(user: User) {
    const payload: JwtPayload = { sub: user.id, username: user.username };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await this.prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    });
    return { accessToken, refreshToken: rawRefreshToken, user: this.toProfile(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.toProfile(user);
  }

  private toProfile(user: User) {
    return { id: user.id, username: user.username, email: user.email, rating: user.rating, createdAt: user.createdAt };
  }
}
```

### 8. Create AuthController

`backend/src/auth/auth.controller.ts`:
- POST /auth/register — no guard, @Body() dto: RegisterDto, returns this.authService.register(dto), @HttpCode(201)
- POST /auth/login — @UseGuards(LocalAuthGuard), @Request() req, returns this.authService.login(req.user)
- GET /auth/me — @UseGuards(JwtAuthGuard), returns this.authService.getMe(req.user.userId)

### 9. Create AuthModule

`backend/src/auth/auth.module.ts`:
```typescript
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
```

### 10. Register in AppModule

Add `AuthModule` to imports array in `backend/src/app.module.ts`.

## Verification

Start the server: `npm run start:dev`

Test with curl:
```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'
# Expected: 201 { user: { id, username, email, rating, createdAt } }

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# Expected: 200 { accessToken, refreshToken, user }

# Me (use token from login)
curl http://localhost:3000/auth/me \
  -H "Authorization: Bearer <accessToken>"
# Expected: 200 { id, username, email, rating, createdAt }
```
