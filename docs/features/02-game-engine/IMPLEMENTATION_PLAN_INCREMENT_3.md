# 02-Game-Engine — Increment 3

## Scope
Frontend board: board locked to player color, move animation, draw/resign controls, rating change modal, rematch flow.

## Prerequisites
Increments 1 and 2 complete (all game events working).

## Files created
- `frontend/src/hooks/useGameSocket.ts`
- `frontend/src/components/ChessBoard.tsx`
- `frontend/src/components/GameClock.tsx`
- `frontend/src/components/GameOver.tsx`
- `frontend/src/components/DrawControls.tsx`
- `frontend/src/pages/GamePage.tsx`

## Acceptance criteria
- Board shows correct orientation (player's pieces at bottom)
- Cannot move opponent's pieces
- Move is emitted on drag-drop; board waits for server confirmation
- move_made updates board and clocks
- game_over shows modal with result, reason, and rating delta
- Offer draw / resign buttons work
- Clock turns red when < 30 seconds

## Complexity: L (Large) — ~8-12 hours
