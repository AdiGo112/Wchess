# ADR-0013: MongoDB for Chat Message Storage

**Status:** Accepted
**Date:** 2026-06-23

## Context

Chat messages need to be stored so that players can see message history when rejoining a game. Key requirements: (1) automatic expiry after 30 days (no manual cleanup job), (2) fast writes under high message volume, (3) flexible schema in case we add reactions or attachments later.

Two main options were considered: PostgreSQL (with a scheduled cleanup job for old messages) and MongoDB (with a native TTL index).

## Decision

Store chat messages in MongoDB in a `messages` collection. Create a TTL index on the `createdAt` field with `expireAfterSeconds: 2592000` (30 days). MongoDB's background TTL thread automatically deletes expired documents without any application code.

## Consequences

**Positive:**
- Native TTL index: zero application code needed for message expiry. MongoDB handles it automatically.
- Fast writes: MongoDB's append-only document writes are extremely fast for high-volume chat scenarios.
- Flexible schema: adding `reactions`, `replyTo`, `editedAt` fields in a future version requires no migration.
- MongoDB is already a dependency for analysis results and notifications, so no new infrastructure.

**Negative:**
- Two databases for related data (User is in PostgreSQL, ChatMessage is in MongoDB). Queries that span both require application-level joins (fetch game participants from PostgreSQL, then query MongoDB for messages).
- TTL index deletion is background (not instant): a document may live up to 60 seconds past its TTL before deletion. Acceptable for this use case.

**Neutral:**
- Chat messages are not relational: they reference gameId and userId as strings, not foreign keys. This is fine because chat history is accessed by gameId only, never via a JOIN from the games table.
