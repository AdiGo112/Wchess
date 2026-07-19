# 02-Game-Engine — Increment 1

## Scope
Backend game gateway: join_room, move validation, clock management, all terminal states (checkmate/stalemate/timeout/resign).

## Files created
- `backend/src/game/game.module.ts`
- `backend/src/game/game.gateway.ts`
- `backend/src/game/game.service.ts`
- `backend/src/game/clock.service.ts`
- `backend/src/game/guards/ws-jwt.guard.ts`
- `backend/src/game/dto/move.dto.ts`
- `backend/src/game/types/game-state.interface.ts`
- `backend/prisma/schema.prisma` (Game + Move models added)

## Acceptance criteria
- Two WS clients can join a game room and receive game_state
- Legal move is broadcast as move_made to both clients
- Illegal move returns error { code: ILLEGAL_MOVE } to mover
- Clock counts down on server; clock_update emitted every second
- Timeout triggers game_over with correct result
- Checkmate triggers game_over
- Resign emits game_over immediately

## Complexity: L (Large) — ~8-12 hours
