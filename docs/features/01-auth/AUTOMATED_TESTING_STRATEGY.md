# 01-Auth — Automated Testing Strategy

## Testing layers

### Unit tests (Jest)
Test AuthService in isolation. Mock PrismaService and bcrypt.

**Key unit test scenarios:**
- `validateUser` returns user when credentials are correct
- `validateUser` returns null when email not found
- `validateUser` returns null when password does not match
- `register` throws ConflictException when email already exists
- `register` throws ConflictException when username already exists
- `register` hashes password before storing (assert passwordHash !== plaintext)
- `login` generates accessToken with correct payload (sub, username)
- `login` stores hashed refresh token (assert stored value !== raw token)
- `refresh` returns new tokens when valid refresh token presented
- `refresh` throws UnauthorizedException when token not found
- `refresh` throws UnauthorizedException when token is expired
- `logout` deletes all refresh tokens for userId

### Integration tests (Jest + Supertest)
Spin up the NestJS app against a test PostgreSQL database. Use Prisma migrations on a test schema.

**Key integration test scenarios:**
- POST /auth/register — happy path returns 201 and correct body shape
- POST /auth/register — duplicate email returns 409
- POST /auth/register — duplicate username returns 409
- POST /auth/login — correct credentials return 200 with tokens
- POST /auth/login — wrong password returns 401
- POST /auth/login — unknown email returns 401
- POST /auth/refresh — valid token issues new tokens
- POST /auth/refresh — used/invalid token returns 401
- POST /auth/logout — clears tokens, subsequent refresh fails
- GET /auth/me — with valid JWT returns user profile
- GET /auth/me — without JWT returns 401

### Frontend tests (Vitest + Testing Library)
Mock the API layer. Test component behavior and AuthContext state.

**Key frontend test scenarios:**
- LoginPage shows validation errors for empty fields
- LoginPage shows API error toast on 401 response
- SignupPage shows password mismatch error
- SignupPage redirects to /login on success
- ProtectedRoute renders children when authenticated
- ProtectedRoute redirects to /login when not authenticated
- useAuth hook triggers refresh when 401 received

## What to mock

- In unit tests: PrismaService (return mock User/RefreshToken), bcryptjs (spy on hash/compare)
- In integration tests: nothing (use real DB with test data seeded in beforeEach)
- In frontend tests: axios (mock API responses), react-router (MemoryRouter)

## Coverage targets

- AuthService: 90% statement coverage
- AuthController: 80% statement coverage
- Frontend components: 75% statement coverage
- Integration test: all endpoint + error code combinations covered
