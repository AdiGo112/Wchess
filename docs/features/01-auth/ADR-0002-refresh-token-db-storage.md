# ADR-0002: Refresh Token Storage in PostgreSQL

**Status:** Accepted
**Date:** 2026-06-23

## Context

Refresh tokens need to be stored server-side to support revocation (logout). The two main candidates were Redis (fast, in-memory, TTL support) and PostgreSQL (durable, relational, already used for User data).

If we lose refresh tokens (e.g., Redis restart without persistence), every logged-in user would be silently logged out — a poor experience. Refresh tokens are also tied to users and need to cascade-delete when a user is deleted.

## Decision

Store refresh tokens in PostgreSQL in a `RefreshToken` table. Store the SHA-256 hash of the raw token (never the raw token itself). The raw token is returned to the client once at login time.

## Consequences

**Positive:**
- Durable: PostgreSQL data survives process restarts.
- Revocation is reliable: delete the row to invalidate. No eventual consistency issues.
- Cascade delete: when a User is deleted, all their RefreshToken rows are automatically deleted.
- Rotation detected: since we delete the old row on refresh, a reused refresh token returns 401 immediately (the row no longer exists).

**Negative:**
- Every /auth/refresh call hits the database. This is acceptable because refresh is infrequent (once per 15 minutes at most per user).
- The RefreshToken table will grow over time. A periodic cleanup job should remove rows where expiresAt < NOW() (future maintenance task).

**Neutral:**
- Redis could have been used with AOF persistence, but this would add operational complexity. PostgreSQL is already required for user data, so using it for refresh tokens avoids a second dependency for this purpose.
