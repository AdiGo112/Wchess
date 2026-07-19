# ADR-0001: JWT Access Token Strategy (HS256, 15-minute expiry)

**Status:** Accepted
**Date:** 2026-06-23

## Context

ChessWeb needs to authenticate API requests. The two main options are server-side sessions (stored in Redis or PostgreSQL) and stateless JWT tokens. We also needed to decide on the algorithm and expiry duration.

Real-time game endpoints use WebSocket (Socket.io), which needs the same authentication mechanism. The matchmaking queue, game moves, and chat all need to know the authenticated user without hitting the database on every message.

## Decision

Use HS256 (HMAC-SHA256) JWT tokens with a 15-minute expiry as the access token mechanism.

- Algorithm: HS256 (symmetric, single secret key)
- Expiry: 15 minutes
- Payload: `{ sub: userId, username, iat, exp }`
- Verification: in-memory (parse + verify signature, no DB lookup)
- Storage: frontend keeps token in memory (React state/ref), not localStorage

## Consequences

**Positive:**
- No database lookup on every authenticated request — the JWT signature proves authenticity.
- Scales horizontally: any NestJS instance can verify any token without shared state.
- Works for both HTTP (Authorization header) and WebSocket (pass token in handshake query/header).
- 15-minute expiry limits the damage window if a token is leaked.

**Negative:**
- Tokens cannot be revoked before expiry — if an access token is stolen, the attacker has up to 15 minutes.
- HS256 uses a shared secret; if the secret is compromised, all tokens are compromised. RS256 (asymmetric) would be safer in a multi-service environment but adds key management complexity.
- Short expiry means refresh tokens and a refresh flow are required.

**Neutral:**
- The 15-minute window is a deliberate tradeoff: short enough to limit stolen-token risk, long enough that most user sessions don't require frequent refreshes (with silent refresh, the UX impact is zero).
