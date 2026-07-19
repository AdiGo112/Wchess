# Feature 07 — Tournaments: Increment 2 Implementation Plan

## Scope

Backend join/leave/standings: `POST /tournaments/:id/join`, `DELETE /tournaments/:id/leave`, and `GET /tournaments/:id/standings` with score + Buchholz sort.

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/src/tournaments/tournaments.controller.ts` | Modify (add join, leave, standings endpoints) |
| `backend/src/tournaments/tournaments.service.ts` | Modify (add join, leave, getStandings methods) |

## Acceptance Criteria

- [ ] `POST /tournaments/:id/join` creates a `TournamentPlayer` row for the authenticated user.
- [ ] Join when `status !== 'UPCOMING'` returns `400` with error code `NOT_UPCOMING`.
- [ ] Join when already registered returns `409` with error code `ALREADY_JOINED`.
- [ ] Join when `playerCount >= maxPlayers` returns `409` with error code `TOURNAMENT_FULL`.
- [ ] `DELETE /tournaments/:id/leave` removes the `TournamentPlayer` row.
- [ ] Leave when `status !== 'UPCOMING'` returns `400 NOT_UPCOMING`.
- [ ] Leave when not registered returns `400 NOT_REGISTERED`.
- [ ] `GET /tournaments/:id/standings` returns players sorted by `score DESC`, then `buchholz DESC`, with rank numbers.
- [ ] For `UPCOMING` tournaments, standings returns all registered players with score 0.

## Complexity

**S (Small)** — Straightforward Prisma operations with guard checks. The standings sort is simple in-memory after a Prisma query.
