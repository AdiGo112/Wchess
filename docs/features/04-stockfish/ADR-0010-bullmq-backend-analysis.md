# ADR-0010: BullMQ Backend Worker for Post-Game Analysis

**Status:** Superseded (2026-09-07) — the async-and-poll shape held, the transport did not
**Date:** 2026-06-23

> **Superseded by the Stockfish Increment 2 implementation** (`backend/src/analysis/`).
> What survived: analysis runs off the request path, the endpoint returns
> immediately, the client polls, and it is not the browser's job.
>
> What did not:
>
> - **BullMQ is gone.** ADR-0032 deleted Bull along with the tournaments and
>   notifications features that were this ADR's "no new dependency" argument. On a
>   single instance the queue is a promise chain over one engine — one sweep at a
>   time, three waiting, 503 past that. Re-adding a broker buys nothing until there
>   is a second instance to distribute to.
> - **MongoDB is gone** (2026-07-19). Results live in the Postgres `GameAnalysis`
>   table, one row per game, `ON DELETE CASCADE` from `Game`.
> - **Jobs do not survive restart, deliberately.** A restart drops in-flight sweeps
>   and the next POST restarts one, which beats a `RUNNING` row wedged in the
>   database. Finished analyses are permanent, and a re-request is served from the
>   stored row.
> - The endpoint is `POST /analysis/:gameId`, not `POST /analysis/request` +
>   `/analysis/:gameId/status`.
>
> The engine itself is Stockfish 18 lite WASM in a **child process** over UCI —
> the same build ADR-0009 runs in the browser. See `docs/CURRENT_SPRINT.md` for why
> a `worker_threads` worker was tried first and failed, and
> `docs/architecture/api-reference.md` for the live contract.

## Context
Post-game analysis requires running Stockfish at depth 18 on every move in a game (potentially 40-80 moves). This takes 20-40 seconds of CPU time. Running this synchronously in an HTTP request would time out and block the server. Browser WASM would work for short analyses but is unreliable for long operations (tab close loses progress).

## Decision
Use BullMQ (Redis-backed job queue) to process analysis jobs asynchronously. The HTTP endpoint enqueues a job and returns immediately. The BullMQ worker (a NestJS @Processor) processes the job in the background and stores the result in MongoDB when done. The client polls /analysis/:gameId/status until 'done'.

## Consequences
**Positive:** HTTP endpoint returns immediately (<100ms). Analysis survives server restarts (BullMQ persists jobs in Redis). Workers can be scaled horizontally by adding more BullMQ worker processes. Failed jobs are automatically retried (configurable).
**Negative:** Users must wait and poll for results — real-time push via Socket.io would be better UX (future enhancement). Redis is required as both BullMQ transport and general cache.
**Neutral:** BullMQ is already used for tournament round advancement (07-tournaments) and email notifications (10-notifications), so no new dependency is introduced.
