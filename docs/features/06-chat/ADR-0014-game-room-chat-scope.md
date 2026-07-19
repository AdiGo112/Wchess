# ADR-0014: Chat Scoped to Game Room Only (No Global/Lobby Chat in v1)

**Status:** Accepted
**Date:** 2026-06-23

## Context

We considered adding a global lobby chat (visible to all logged-in users) and a friends-only direct message system. However, the chess platform community can be toxic (trash talk, harassment), and these features require:

- Content moderation and reporting workflows
- User blocking and muting
- NSFW content filtering
- Admin tooling for banning chatters
- Appeals process for moderation actions

Building this infrastructure is a significant undertaking that is out of scope for v1.

## Decision

Chat is limited to in-game messages between the two players in an active game. No global chat, no lobby chat, no friend DMs.

This is explicitly an intentional v1 scope decision, not a permanent limitation.

## Consequences

**Positive:**
- Zero moderation burden. In-game chat between two consenting players is self-regulating — both players can close the chat panel.
- Simple implementation: no fan-out to thousands of subscribers, no message queues for large rooms.
- The profanity filter (bad-words) and 1 msg/sec rate limit are sufficient for the two-player scope.
- Ship faster: omitting global chat saves 2-3 weeks of development and infrastructure work.

**Negative:**
- Players cannot coordinate tournament matches or discuss tactics in a lobby.
- Social features (feature 09) provide some compensation with the activity feed and friend system.

**Neutral:**
- The architecture (Socket.io rooms, MongoDB messages collection) is designed to support broader chat in the future. Adding a global room would require adding a single new Socket.io namespace and a new MongoDB index, not a rewrite.
