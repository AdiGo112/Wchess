# ADR-0006: Redis for Active Game State

**Status:** Accepted
**Date:** 2026-06-23

## Context
Active games need sub-millisecond reads on every move event. Game state (FEN, clocks, move history) changes many times per second. PostgreSQL row-level locking and write amplification would be too slow for real-time chess. We needed a storage layer for in-flight game state.

## Decision
Active game state is stored in Redis as a JSON hash (game:{gameId}). On game end (any terminal state), the full game is persisted to PostgreSQL and the Redis key is deleted. Redis persistence is configured to AOF (append-only file) to survive restarts.

## Consequences
**Positive:** Sub-millisecond reads from Redis enable real-time move processing without DB bottleneck. Redis TTL can automatically expire abandoned game keys. Horizontal scaling: any NestJS instance can read/write any game's Redis key.
**Negative:** Redis is an additional infrastructure dependency. If Redis goes down without AOF, in-progress game state is lost. Memory usage grows with concurrent games (each game state is ~2KB; 10,000 concurrent games = ~20MB — acceptable).
**Neutral:** Completed games are the source of truth in PostgreSQL. Redis is a volatile cache of active state only.
