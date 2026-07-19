# 01-Auth — Feature README

## Goal
Provide secure user registration, login, and session management so every other ChessWeb feature can identify who is making a request.

## User stories
- As a new visitor, I can register with a username, email, and password so I have an account.
- As a returning user, I can log in and receive a short-lived access token that gates all authenticated API calls.
- As an active user, my session is silently refreshed before the access token expires so I am not logged out mid-game.
- As a user on a shared device, I can log out and have my refresh token invalidated immediately.

## Dependencies on other features
- None — auth is the foundation. Every other feature depends on auth.

## Output artifacts

### REST endpoints
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout

### NestJS guards
- JwtAuthGuard — applied to all protected routes
- LocalAuthGuard — applied to POST /auth/login

### Frontend components
- LoginPage
- SignupPage
- AuthContext / useAuth hook
- ProtectedRoute HOC

## Tech stack used by this feature
- bcryptjs (password hashing)
- @nestjs/jwt + passport-jwt (JWT signing and verification)
- passport-local (local strategy for login)
- Prisma (User and RefreshToken models in PostgreSQL)
- React Context API (frontend auth state)
- axios (HTTP client with interceptor for token injection and refresh)
