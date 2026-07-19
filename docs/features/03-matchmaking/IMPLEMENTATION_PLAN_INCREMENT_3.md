# 03-Matchmaking — Increment 3

## Scope
Frontend lobby: quick match UI, variant + time control selectors, friend challenge by link, vs-computer mode, queue status display.

## Prerequisites
Increments 1 and 2 complete.

## Files created
- `frontend/src/pages/LobbyPage.tsx`
- `frontend/src/hooks/useMatchmakingSocket.ts`
- `frontend/src/components/VariantSelector.tsx`
- `frontend/src/components/DifficultySlider.tsx`

## Acceptance criteria
- Quick match flow: select variant → searching state → match_found → /game/:gameId
- Challenge flow: create link → copy → share → opponent accepts → both at /game/:gameId
- Computer game: select difficulty → POST → /game/:gameId
- Cancel button removes player from queue

## Complexity: M (Medium) — ~4-6 hours
