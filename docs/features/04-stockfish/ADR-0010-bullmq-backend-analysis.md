# ADR-0010: BullMQ Backend Worker for Post-Game Analysis

**Status:** Accepted
**Date:** 2026-06-23

## Context
Post-game analysis requires running Stockfish at depth 18 on every move in a game (potentially 40-80 moves). This takes 20-40 seconds of CPU time. Running this synchronously in an HTTP request would time out and block the server. Browser WASM would work for short analyses but is unreliable for long operations (tab close loses progress).

## Decision
Use BullMQ (Redis-backed job queue) to process analysis jobs asynchronously. The HTTP endpoint enqueues a job and returns immediately. The BullMQ worker (a NestJS @Processor) processes the job in the background and stores the result in MongoDB when done. The client polls /analysis/:gameId/status until 'done'.

## Consequences
**Positive:** HTTP endpoint returns immediately (<100ms). Analysis survives server restarts (BullMQ persists jobs in Redis). Workers can be scaled horizontally by adding more BullMQ worker processes. Failed jobs are automatically retried (configurable).
**Negative:** Users must wait and poll for results — real-time push via Socket.io would be better UX (future enhancement). Redis is required as both BullMQ transport and general cache.
**Neutral:** BullMQ is already used for tournament round advancement (07-tournaments) and email notifications (10-notifications), so no new dependency is introduced.
