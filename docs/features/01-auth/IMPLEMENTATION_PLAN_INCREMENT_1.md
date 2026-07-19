# 01-Auth — Implementation Plan: Increment 1

## Scope
Backend core: register + login endpoints, bcrypt, JWT signing, Prisma User model.

## What gets built
- Prisma schema: User model and RefreshToken model
- DTOs: RegisterDto, LoginDto
- AuthService: register(), validateUser(), login()
- LocalStrategy + LocalAuthGuard
- JwtStrategy + JwtAuthGuard
- AuthController: POST /auth/register, POST /auth/login
- AuthModule wired into AppModule

## Exact files created/modified

Created:
- `backend/prisma/schema.prisma` (User + RefreshToken models added)
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/auth.controller.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/dto/register.dto.ts`
- `backend/src/auth/dto/login.dto.ts`
- `backend/src/auth/strategies/local.strategy.ts`
- `backend/src/auth/strategies/jwt.strategy.ts`
- `backend/src/auth/guards/jwt-auth.guard.ts`
- `backend/src/auth/guards/local-auth.guard.ts`
- `backend/src/auth/types/jwt-payload.interface.ts`

Modified:
- `backend/src/app.module.ts` (add AuthModule import)
- `backend/.env` (add JWT_SECRET)

Migration:
- `npx prisma migrate dev --name init-auth`

## Acceptance criteria
- POST /auth/register 201 with user profile (no tokens)
- POST /auth/register 409 for duplicate email or username
- POST /auth/login 200 with { accessToken, refreshToken, user }
- POST /auth/login 401 for wrong credentials
- GET /auth/me 200 with valid JWT
- GET /auth/me 401 without JWT

## Estimated complexity
M (Medium) — standard NestJS patterns, ~4-6 hours
