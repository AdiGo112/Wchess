# 02-Game-Engine — Automated Testing Prompt

Copy and paste to an AI coding assistant.

---

You are writing automated tests for the chess game engine feature of ChessWeb, a NestJS + React application.

## What exists (assume complete and working)

Backend:
- `backend/src/game/game.gateway.ts` — GameGateway with Socket.io events: join_room, move, offer_draw, accept_draw, decline_draw, resign, claim_timeout
- `backend/src/game/game.service.ts` — GameService with methods: applyMove, handleTimeout, handleResign, handleDrawAccept, handleDrawDecline, persistGame
- `backend/src/game/clock.service.ts` — ClockService managing setInterval timers per game
- `backend/prisma/schema.prisma` — Game and Move models

Frontend:
- `frontend/src/components/ChessBoard.tsx` — chess board with drag-drop moves
- `frontend/src/components/GameClock.tsx` — countdown timer display
- `frontend/src/components/GameOver.tsx` — modal shown on game end
- `frontend/src/hooks/useGameSocket.ts` — socket management hook

## Task: Write all tests

### 1. GameService unit tests
File: `backend/src/game/game.service.spec.ts`
- Mock Redis client and PrismaService
- Test applyMove: legal move updates state, illegal move returns error, wrong turn returns error
- Test handleTimeout: loss when opponent has material, draw when insufficient material
- Test handleResign: correct result set, game persisted

### 2. Integration tests
File: `backend/src/game/game.e2e.spec.ts`
- Use socket.io-client, two client instances
- Test complete game flow: join_room → move back and forth → checkmate
- Test disconnect grace period: client1 disconnects, client2 receives countdown, client1 reconnects before 30s

### 3. Frontend tests
File: `frontend/src/__tests__/game/ChessBoard.test.tsx`
- Mock useGameSocket hook
- Test: board renders, move emit on legal piece drag, error display on ILLEGAL_MOVE event
- Test: board pieces locked when not player's turn
