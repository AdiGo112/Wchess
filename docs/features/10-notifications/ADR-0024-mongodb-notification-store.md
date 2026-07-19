# ADR-0024: Store Notifications in MongoDB

**Status:** Accepted
**Date:** 2026-06-24

## Context

ChessWeb needs to persist notification documents for each user so that:
- Users can see their notification history even after reconnecting or refreshing.
- The unread count can be computed accurately after a socket reconnect.
- Notifications from different event types (game results, friend requests, tournament starts, achievements, rating milestones) carry different payload shapes that are not uniform.

The existing data stores in the project are PostgreSQL (relational, structured data) and MongoDB (document store, flexible schemas). Redis is used for caching and BullMQ queues but not for persistent storage.

Storing notifications in PostgreSQL would require a wide JSONB column for the payload, or separate tables per notification type, leading to schema complexity. The notification data does not need strong relational guarantees (e.g., no joins against other tables are needed at query time — only the userId matters for routing). Notifications are also ephemeral by nature: they have a natural expiry (90 days) and are consumed rather than archived.

## Decision

Notifications are stored in MongoDB's `notifications` collection with a compound index on `{ userId: 1, read: 1, createdAt: -1 }` and a TTL index on `createdAt` with `expireAfterSeconds: 0` and `expires: '90d'`. The document schema stores `userId` as a plain string (the PostgreSQL user UUID) without a foreign key reference.

## Consequences

**Positive:**
- Flexible `payload` field accommodates any notification type's metadata without schema migrations.
- The compound index makes `GET /notifications/unread-count` (filter by userId + read) a fast indexed query even at scale.
- The TTL index automatically purges old notifications without a cron job or manual cleanup process.
- Consistent with existing MongoDB usage in the project (e.g., chat messages, analysis results).

**Negative:**
- No foreign key constraint between `notifications.userId` and `users.id` in PostgreSQL. If a user is deleted from PostgreSQL, their notifications remain in MongoDB until the TTL expires. A cleanup process would need to be added if user deletion becomes a product requirement.
- MongoDB transactions across notification creation and game-state updates are not possible without a two-phase approach, since game state lives in PostgreSQL.

**Neutral:**
- The `payload` field is typed only by convention (TypeScript interfaces in API_DESIGN.md), not enforced at the database layer. Validation happens in the service layer.
