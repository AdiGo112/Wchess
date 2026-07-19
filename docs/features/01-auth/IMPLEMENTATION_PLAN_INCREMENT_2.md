# 01-Auth — Implementation Plan: Increment 2

## Scope
Backend refresh/logout: RefreshToken model in use, /auth/refresh, /auth/logout, token rotation.

## Prerequisites
Increment 1 is complete: User model, login, JWT strategy all working.

## What gets built
- AuthService: refresh(), logout() methods
- RefreshDto
- AuthController: POST /auth/refresh, POST /auth/logout
- Token rotation logic (delete old row, insert new row on refresh)
- SHA-256 hashing of refresh token before storage

## Exact files created/modified

Created:
- `backend/src/auth/dto/refresh.dto.ts`

Modified:
- `backend/src/auth/auth.service.ts` (add refresh, logout, import crypto)
- `backend/src/auth/auth.controller.ts` (add /auth/refresh, /auth/logout routes)

## Acceptance criteria
- POST /auth/refresh with valid token returns new accessToken + new refreshToken
- POST /auth/refresh with used token returns 401 REFRESH_TOKEN_INVALID
- POST /auth/refresh with expired token returns 401 REFRESH_TOKEN_INVALID
- POST /auth/logout deletes all refresh tokens for the user
- After logout, POST /auth/refresh returns 401

## Estimated complexity
S (Small) — adds 2 methods and 2 routes on top of increment 1, ~2-3 hours
