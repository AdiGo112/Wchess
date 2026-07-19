# ADR-0007: Redis List Queues for Matchmaking

**Status:** Accepted
**Date:** 2026-06-23

## Context
The matchmaking queue needs to hold waiting players and support fast enqueue, dequeue, and scan operations. We needed a data structure that supports ordered access (FIFO) and selective removal (when a player cancels).

## Decision
Use one Redis List per variant+timeControl combination. LPUSH to enqueue (O(1)). LRANGE 0 -1 to scan all waiting players (O(N)). LREM to remove a specific player (O(N)).

The queue key format is `queue:{variant}:{timeControl}`, e.g., `queue:blitz:300`.

## Consequences
**Positive:** FIFO ordering means players who wait longest get priority. LPUSH/RPOP is O(1). Simple implementation — no sorted set complexity.
**Negative:** LREM is O(N). With N=1000 players in a queue, LREM is still sub-millisecond. Acceptable for chess matchmaking scale.
**Neutral:** Separate keys per variant means no cross-variant matching (intentional — a 1|0 bullet player shouldn't be matched with a 30|0 classical player).
