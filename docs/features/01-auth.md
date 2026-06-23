# Feature 01 — Auth

**Branch:** `feature/auth`
**Depends on:** nothing (first feature)

## Goal
Secure registration and login with JWT. Every other feature depends on knowing who the user is.

---

## Backend

### Files
```
backend/src/auth/
├── auth.module.ts
├── auth.controller.ts
├── auth.service.ts
├── jwt.strategy.ts
├── jwt-auth.guard.ts
└── dto/
    ├── register.dto.ts
    └── login.dto.ts
```

### Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Create account, return JWT pair |
| POST | `/api/v1/auth/login` | Login, return JWT pair |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| GET | `/api/v1/auth/me` | Return current user from DB |

### JWT Strategy
- `accessToken`: HS256, 15-minute expiry. Payload: `{ sub: userId, username, role }`
- `refreshToken`: opaque UUID, stored in PostgreSQL `RefreshToken` table, 30-day expiry
- On refresh: validate token in DB → delete old → issue new pair (rotation)

### Validation (DTOs)
```typescript
// register.dto.ts
username: min 3, max 20, /^[a-zA-Z0-9_]+$/
email:    valid email
password: min 8, max 72
name:     min 1, max 50

// login.dto.ts
username: string
password: string
```

### Password security
- bcrypt with 10 salt rounds
- Never return `passwordHash` in any response

### Error codes
| Code | Meaning |
|---|---|
| AUTH_001 | Username already taken |
| AUTH_002 | Email already registered |
| AUTH_003 | Invalid credentials |
| AUTH_004 | Token expired |
| AUTH_005 | Token invalid |
| AUTH_007 | Refresh token invalid or expired |

---

## Frontend

### Files
```
frontend/src/
├── api/client.ts           — axios instance with JWT interceptor
├── context/AuthContext.jsx — JWT state, login/logout/refresh
├── components/ProtectedRoute.jsx
├── pages/Login.jsx
└── pages/Signup.jsx
```

### Auth Flow
1. User registers → receives `{ accessToken, refreshToken, user }`
2. Store `accessToken` in memory (Zustand), `refreshToken` in `localStorage`
3. Axios interceptor attaches `Authorization: Bearer <token>` to every request
4. On 401 response → auto-call `/auth/refresh` → retry original request
5. On refresh failure → logout → redirect to `/login`

### ProtectedRoute
Wraps routes that require auth. Redirects to `/login` if no valid token.

---

## Checklist
- [ ] `POST /auth/register` — bcrypt, Prisma create, return JWT
- [ ] `POST /auth/login` — bcrypt compare, return JWT
- [ ] `POST /auth/refresh` — rotate refresh token
- [ ] `POST /auth/logout` — delete refresh token from DB
- [ ] `GET /auth/me` — JwtAuthGuard, return user
- [ ] JwtStrategy (passport-jwt)
- [ ] JwtAuthGuard decorator
- [ ] Prisma: RefreshToken model migration
- [ ] Frontend: Login page (username + password)
- [ ] Frontend: Signup page (name + username + email + password)
- [ ] Frontend: AuthContext with auto-refresh
- [ ] Frontend: Axios interceptor
- [ ] Frontend: ProtectedRoute component

## Verify
1. `POST /auth/register` → 201 with token
2. `GET /auth/me` with token → returns user
3. `GET /auth/me` without token → 401
4. `POST /auth/login` with wrong password → 401 AUTH_003
5. `POST /auth/refresh` → new token pair
6. Frontend: register → auto-login → redirected to home
7. Frontend: refresh token used on 401 → seamless retry
