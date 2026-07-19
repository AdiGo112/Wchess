# 01-Auth — Delivery Notes

## Acceptance criteria

- [ ] POST /auth/register creates a user and returns 201 with user profile (no tokens).
- [ ] POST /auth/register returns 409 if email is already taken.
- [ ] POST /auth/register returns 409 if username is already taken.
- [ ] POST /auth/login returns 401 for wrong email or wrong password (same error message for both — no enumeration).
- [ ] POST /auth/login returns accessToken (JWT, 15m expiry) and refreshToken (opaque, 7d).
- [ ] POST /auth/refresh issues new tokens and invalidates the old refresh token.
- [ ] POST /auth/refresh returns 401 if the refresh token has been used before (rotation detected).
- [ ] POST /auth/logout returns 204 and all refresh tokens for the user are deleted.
- [ ] GET /auth/me returns the current user's profile when called with a valid JWT.
- [ ] Protected routes return 401 when called without a token.
- [ ] Protected routes return 401 when called with an expired token.
- [ ] Frontend redirects unauthenticated users to /login.
- [ ] Frontend silently refreshes the token when a 401 is received.
- [ ] Frontend does not store the access token in localStorage.

## Edge cases to handle

- Concurrent refresh: if two requests 401 at the same time, the interceptor should only fire one refresh, queue the second, then replay both.
- Refresh token reuse: if an attacker replays a used refresh token, return 401 (the row was already deleted by rotation).
- Registration with same email, different casing: normalize email to lowercase before uniqueness check.
- Very long passwords: bcrypt truncates at 72 bytes. If password > 72 chars, warn but still process (do not silently truncate without user knowledge — v1 accepts this limitation).
- Clock skew: JWT exp is checked server-side. Client clock drift does not affect server validation.

## Known limitations in v1

- No email verification: users register without confirming their email. Plan to add in a future increment.
- No rate limiting on login: a brute-force protection layer (e.g., 5 attempts per IP per minute) is not in scope for v1.
- No OAuth (Google, GitHub): only username/password in v1.
- No MFA (2FA): not in scope for v1.
- Logout logs out all devices: single-device logout is a future enhancement.

## Out of scope for v1

- Password reset flow
- Email verification
- OAuth providers
- Multi-factor authentication
- Admin user roles / RBAC
- Session listing ("active devices")
