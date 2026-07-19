# Feature 07 — Tournaments: Increment 1 Implementation Plan

## Scope

Backend CRUD: `TournamentsModule` with list, get by ID, and create endpoints. Prisma `Tournament` and `TournamentPlayer` models added to schema. No join/leave, no pairing, no BullMQ yet.

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/prisma/schema.prisma` | Modify (add Tournament, TournamentPlayer models) |
| `backend/src/tournaments/dto/create-tournament.dto.ts` | Create |
| `backend/src/tournaments/tournaments.controller.ts` | Create |
| `backend/src/tournaments/tournaments.service.ts` | Create |
| `backend/src/tournaments/tournaments.module.ts` | Create |
| `backend/src/app.module.ts` | Modify (add TournamentsModule) |

## Acceptance Criteria

- [ ] `npx prisma migrate dev` succeeds and creates `Tournament` and `TournamentPlayer` tables.
- [ ] `POST /tournaments` creates a tournament with correct `maxRounds` computed (Swiss: `ceil(log2(maxPlayers))`).
- [ ] `POST /tournaments` with `startAt` in the past returns 400 validation error.
- [ ] `GET /tournaments` returns paginated list with `status`, `format`, `page`, `limit` query filters.
- [ ] `GET /tournaments/:id` returns full tournament detail including empty `players` array.
- [ ] `GET /tournaments/nonexistent-id` returns 404.

## Complexity

**S (Small)** — Standard CRUD with Prisma. The only slightly non-trivial piece is computing `maxRounds` based on format.
