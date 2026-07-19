# 01-Auth — Automated Testing Prompt

Copy and paste the following prompt to an AI coding assistant to generate the test suite for the auth feature.

---

You are writing automated tests for the authentication feature of ChessWeb, a NestJS + React chess web application.

## What already exists (assume these files exist and are complete)

Backend:
- `backend/src/auth/auth.service.ts` — AuthService with methods: register, validateUser, login, refresh, logout
- `backend/src/auth/auth.controller.ts` — AuthController with routes: POST /auth/register, POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /auth/me
- `backend/src/auth/strategies/jwt.strategy.ts` — JwtStrategy (passport-jwt)
- `backend/src/auth/strategies/local.strategy.ts` — LocalStrategy (passport-local)
- `backend/src/auth/guards/jwt-auth.guard.ts` — JwtAuthGuard
- `backend/src/auth/guards/local-auth.guard.ts` — LocalAuthGuard
- `backend/prisma/schema.prisma` — User and RefreshToken models

Frontend:
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/SignupPage.tsx`
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/lib/axios.ts` — axios instance with interceptors

## Task: Write all tests

### 1. Backend unit tests

File: `backend/src/auth/auth.service.spec.ts`

Use Jest. Mock PrismaService with jest.mock or @nestjs/testing createMock. Mock bcryptjs.

Write tests for:
- `validateUser(email, password)` — correct creds, wrong email, wrong password
- `register(dto)` — success creates user with hashed password; duplicate email throws ConflictException (code 409); duplicate username throws ConflictException
- `login(user)` — returns accessToken (verify with jwt.verify) and rawRefreshToken; stores tokenHash (SHA-256) not raw in DB
- `refresh(dto)` — valid token returns new tokens and deletes old RefreshToken; invalid/expired token throws UnauthorizedException
- `logout(userId)` — deletes all RefreshToken rows for userId

### 2. Backend integration tests

File: `backend/src/auth/auth.e2e.spec.ts`

Use Jest + Supertest + NestJS Test.createTestingModule. Connect to a real PostgreSQL test database using DATABASE_URL from environment. Run Prisma migrations in beforeAll, clean tables in beforeEach.

Write tests for all routes: happy paths and all error codes defined in API_DESIGN.md.

### 3. Frontend component tests

File: `frontend/src/__tests__/auth/LoginPage.test.tsx`
File: `frontend/src/__tests__/auth/SignupPage.test.tsx`
File: `frontend/src/__tests__/auth/ProtectedRoute.test.tsx`
File: `frontend/src/__tests__/auth/AuthContext.test.tsx`

Use Vitest + @testing-library/react. Wrap components in MemoryRouter. Mock axios with vi.mock.

Write tests for:
- LoginPage: renders form; shows field errors on empty submit; shows toast on 401; redirects to /dashboard on success
- SignupPage: shows password mismatch error; shows 409 error; redirects to /login on success
- ProtectedRoute: renders children when AuthContext has user; redirects to /login when no user
- AuthContext: sets user and token on login; clears state on logout; retries with new token after 401 refresh

## Important implementation details
- RefreshToken tokenHash is SHA-256 of the raw token (use crypto.createHash('sha256').update(raw).digest('hex'))
- Access token JWT_SECRET must be set in test environment (use process.env.JWT_SECRET = 'test-secret' in test setup)
- bcrypt cost factor is 1 in tests (not 10) to keep tests fast — override in test setup
- Integration tests should use a separate database schema named 'test' or use DATABASE_URL_TEST env var
