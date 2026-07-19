# 01-Auth — Workflows

## Workflow 1: User Registration

1. User navigates to /signup.
2. Frontend renders the SignupPage component with fields: username, email, password, confirm password.
3. Client-side validation runs on blur (username 3-20 chars, valid email format, password >= 8 chars, passwords match).
4. User submits the form.
5. Frontend calls POST /auth/register with { username, email, password }.
6. AuthService checks if email exists in PostgreSQL. If yes, returns 409 EMAIL_ALREADY_EXISTS.
7. AuthService checks if username exists. If yes, returns 409 USERNAME_ALREADY_EXISTS.
8. AuthService calls bcrypt.hash(password, 10).
9. Prisma creates User row with passwordHash and default rating 1200.
10. AuthService returns { user } (no tokens — user must log in after registering).
11. Frontend shows success toast and redirects to /login.

## Workflow 2: User Login

1. User navigates to /login.
2. Frontend renders LoginPage with email and password fields.
3. User submits the form.
4. Frontend calls POST /auth/login with { email, password }.
5. LocalStrategy calls AuthService.validateUser(email, password).
6. AuthService fetches User by email. If not found, returns 401 INVALID_CREDENTIALS.
7. AuthService calls bcrypt.compare(password, user.passwordHash). If false, returns 401 INVALID_CREDENTIALS. Note: do not reveal which field was wrong.
8. AuthService.login(user) generates:
   a. accessToken = JWT signed with JWT_SECRET, exp 15 minutes.
   b. rawRefreshToken = crypto.randomBytes(64).toString('hex').
   c. tokenHash = SHA-256 of rawRefreshToken.
   d. RefreshToken row inserted: { tokenHash, userId, expiresAt: now + 7 days }.
9. Response: { accessToken, refreshToken: rawRefreshToken, user }.
10. Frontend stores accessToken in React memory (AuthContext state). Stores refreshToken in a httpOnly cookie or in-memory variable (never localStorage).
11. Frontend axios interceptor attaches Authorization: Bearer <accessToken> to all subsequent requests.
12. Frontend redirects to /dashboard or the originally requested route.

## Workflow 3: Silent Token Refresh

1. An axios response interceptor detects a 401 response from any protected endpoint.
2. Interceptor checks if refresh is already in progress (flag to prevent concurrent refreshes).
3. If not in progress: interceptor calls POST /auth/refresh with { refreshToken }.
4. AuthService looks up RefreshToken row by SHA-256 hash of the presented token.
5. If not found or expired or revoked: respond 401 REFRESH_TOKEN_INVALID. Interceptor triggers logout.
6. If valid: AuthService deletes old RefreshToken row, generates new accessToken + new refreshToken, inserts new RefreshToken row.
7. Response: { accessToken, refreshToken }.
8. Interceptor stores new tokens, retries the original failed request with new accessToken.
9. All queued requests that arrived during refresh also retry with the new accessToken.

## Workflow 4: Logout

1. User clicks "Log out" in the UI.
2. Frontend calls POST /auth/logout with Authorization: Bearer <accessToken>.
3. JwtAuthGuard extracts userId from the JWT.
4. AuthService looks up and deletes all RefreshToken rows for this userId (log out all devices) OR just the current refresh token (log out this device). v1 logs out all devices.
5. Response: 204 No Content.
6. Frontend clears accessToken from memory, clears refreshToken from storage.
7. Frontend redirects to /login.
