# 01-Auth — Implementation Plan: Increment 3

## Scope
Frontend auth: Login page, Signup page, AuthContext, axios interceptor, token stored in memory.

## Prerequisites
Increment 1 and 2 are complete: all 4 auth endpoints are working and tested.

## What gets built
- AuthContext with user state, login(), register(), logout(), refreshToken()
- Axios instance with request interceptor (attach token) and response interceptor (retry on 401)
- LoginPage component
- SignupPage component
- TypeScript types for UserProfile and AuthTokens

## Exact files created/modified

Created:
- `frontend/src/context/AuthContext.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/pages/SignupPage.tsx`
- `frontend/src/types/auth.types.ts`
- `frontend/src/hooks/useAuth.ts`

Modified:
- `frontend/src/lib/axios.ts` (add interceptors)
- `frontend/src/main.tsx` (wrap app in AuthProvider)

## Acceptance criteria
- LoginPage submits to POST /auth/login and stores token in memory
- LoginPage shows error on 401
- SignupPage submits to POST /auth/register
- SignupPage shows 409 error messages by code (email vs username taken)
- After login, GET /auth/me called with correct Authorization header
- After 401 response, new token is fetched and original request is retried (verified by spy on axios)
- Refresh token is stored in sessionStorage (not localStorage)

## Estimated complexity
M (Medium) — AuthContext + interceptor is the main complexity, ~4-6 hours
