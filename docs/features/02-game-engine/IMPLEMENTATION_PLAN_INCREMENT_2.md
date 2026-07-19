# 02-Game-Engine — Increment 2

## Scope
Backend draw flow + disconnect handling: offer_draw, accept_draw, decline_draw, disconnect grace period, auto-resign timer.

## Prerequisites
Increment 1 complete.

## Files modified
- `backend/src/game/game.gateway.ts` (add draw + disconnect handlers)
- `backend/src/game/game.service.ts` (add draw and disconnect methods)

## Acceptance criteria
- offer_draw emits draw_offered to opponent
- accept_draw ends game as draw
- decline_draw emits draw_declined, clears pendingDraw
- Draw offer auto-cancelled if opponent makes a move
- On disconnect: opponent sees 30s countdown
- If disconnected player reconnects within 30s: game resumes
- If not reconnected: auto-resign, game_over emitted

## Complexity: M (Medium) — ~4-6 hours
