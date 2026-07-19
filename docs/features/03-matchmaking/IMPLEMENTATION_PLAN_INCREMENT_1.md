# 03-Matchmaking — Increment 1

## Scope
Backend queue: Redis List queues per variant, join_queue, leave_queue Socket.io events, 500ms polling loop, match_found emit.

## Files created
- `backend/src/matchmaking/matchmaking.module.ts`
- `backend/src/matchmaking/matchmaking.gateway.ts`
- `backend/src/matchmaking/matchmaking.service.ts`
- `backend/src/matchmaking/dto/join-queue.dto.ts`
- `backend/src/matchmaking/types/queue-entry.interface.ts`

## Acceptance criteria
- Player emits join_queue → entry added to Redis List
- Two players with similar ratings → both receive match_found within 2 polling cycles
- Player disconnects → entry removed from Redis
- match_found includes gameId, color, opponent info

## Complexity: M (Medium) — ~4-6 hours
