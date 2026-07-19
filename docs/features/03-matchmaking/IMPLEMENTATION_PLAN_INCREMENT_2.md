# 03-Matchmaking — Increment 2

## Scope
Backend room creation: create_room for computer/friend games, fix dynamic import issues, rating tolerance relaxation algorithm verified.

## Prerequisites
Increment 1 complete.

## Files created/modified
- `backend/src/matchmaking/matchmaking.controller.ts` (challenge endpoints, computer endpoint)
- `backend/src/matchmaking/dto/create-challenge.dto.ts`
- `backend/prisma/schema.prisma` (Challenge model added)

## Acceptance criteria
- POST /matchmaking/challenge returns token and shareUrl
- POST /matchmaking/challenge/:token/accept returns gameId and color
- Creator cannot accept own challenge
- POST /matchmaking/computer returns gameId with blackId=null in Redis

## Complexity: M (Medium) — ~3-5 hours
