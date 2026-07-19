# 01-Auth — Start Here

## What is this feature?
Authentication and authorization for ChessWeb. Covers user registration, login, JWT-based session management, token refresh, and route protection. Every other feature depends on a valid JWT.

## Branch
`feature/auth` (base off `main`)

## Reading order
1. README.md — goal, user stories, dependencies
2. DOMAIN_MODEL.md — User and RefreshToken entities, business rules
3. ARCHITECTURE.md — service map, data flow, file tree
4. API_DESIGN.md — all endpoints, DTOs, error codes
5. WORKFLOWS.md — register, login, refresh, logout flows
6. ADR-0001-jwt-access-token-strategy.md — why stateless JWT
7. ADR-0002-refresh-token-db-storage.md — why PostgreSQL for refresh tokens
8. ADR-0003-bcrypt-10-rounds.md — why 10 bcrypt rounds
9. DELIVERY_NOTES.md — acceptance criteria, out of scope
10. AUTOMATED_TESTING_STRATEGY.md + AUTOMATED_TESTING_PROMPT.md — test plan
11. IMPLEMENTATION_PROMPT_BACKEND.md — AI prompt to build backend
12. IMPLEMENTATION_PROMPT_FRONTEND.md — AI prompt to build frontend
13. IMPLEMENTATION_PLAN_INCREMENT_1.md through IMPLEMENTATION_PLAN_INCREMENT_4.md
14. IMPLEMENTATION_PROMPT_INCREMENT_1.md through IMPLEMENTATION_PROMPT_INCREMENT_4.md

## Key decisions
- Access tokens: HS256 JWT, 15-minute expiry, verified in-memory (no DB lookup per request)
- Refresh tokens: opaque random strings stored in PostgreSQL for durability and revocation
- Passwords hashed with bcrypt at cost factor 10
- Frontend stores access token in memory (not localStorage) to mitigate XSS
