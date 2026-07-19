# 01-Auth — Implementation Plan: Increment 4

## Scope
Frontend protection: ProtectedRoute, 401 auto-refresh, redirect on logout.

## Prerequisites
Increments 1-3 complete. AuthContext and axios interceptor are working.

## What gets built
- ProtectedRoute component (redirects to /login if not authenticated)
- Route configuration in App.tsx wrapping all protected routes
- Logout button connected to authContext.logout()
- Post-logout redirect to /login
- Post-auth redirect to originally requested route

## Exact files created/modified

Created:
- `frontend/src/components/ProtectedRoute.tsx`

Modified:
- `frontend/src/App.tsx` (wrap protected routes in ProtectedRoute, add all route definitions)
- `frontend/src/components/Navbar.tsx` or `frontend/src/layouts/MainLayout.tsx` (add logout button)

## Acceptance criteria
- Navigating to /dashboard without being logged in redirects to /login
- After login, user is redirected back to /dashboard (original route)
- Logout button calls POST /auth/logout and redirects to /login
- After logout, navigating to /dashboard redirects to /login
- On page refresh, the app attempts silent token refresh before deciding route access
- While silent refresh is in progress, a loading spinner is shown (no flash of /login)

## Estimated complexity
S (Small) — mostly wiring existing pieces together, ~2-3 hours
