# 03-Matchmaking — Automated Testing Prompt

Copy and paste to an AI coding assistant.

---

Write automated tests for the matchmaking feature of ChessWeb.

## What exists (assume complete)
- `backend/src/matchmaking/matchmaking.service.ts` — enqueue, dequeue, pairPlayers, createComputerGame
- `backend/src/matchmaking/matchmaking.gateway.ts` — join_queue, leave_queue Socket.io handlers
- `backend/src/matchmaking/matchmaking.controller.ts` — POST challenge, accept, computer
- `frontend/src/pages/LobbyPage.tsx` — quick match, challenge, vs computer UI

## Tests to write

### 1. MatchmakingService unit tests
File: `backend/src/matchmaking/matchmaking.service.spec.ts`
- Mock ioredis with jest-mock-extended
- Test: enqueue pushes to correct Redis key
- Test: pairPlayers at t=0 with ±40 diff → match; ±60 diff → no match
- Test: pairPlayers at t=35 with ±350 diff → match (tolerance expanded to ±400)
- Test: dequeue removes entry by userId

### 2. Integration tests
File: `backend/src/matchmaking/matchmaking.e2e.spec.ts`
- Use real Redis test instance (REDIS_URL_TEST env)
- Create two socket clients (both authenticated)
- Both join queue with same variant, ratings within 50 → match_found within 2s
- Client disconnects → Redis entry removed within 500ms

### 3. Frontend tests
File: `frontend/src/__tests__/matchmaking/LobbyPage.test.tsx`
- Mock socket and axios
- "Find Game" click → join_queue emitted
- match_found event → navigate called with /game/:gameId
- "Copy Challenge Link" → navigator.clipboard.writeText called
