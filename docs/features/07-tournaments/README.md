# Feature 07 — Tournaments

## Goal

Enable players to create, join, and compete in organized chess tournaments with multiple formats (Swiss, Arena, Round Robin, Knockout), automatic round advancement via BullMQ, and live standings with tiebreak calculations.

## User Story

As a chess player, I want to join a tournament, have the system automatically pair me with opponents of similar strength, play my games through the normal game interface, and see live standings so I can track my position throughout the event.

## Depends On

- **Feature 01 — Auth**: JWT authentication for all tournament endpoints and join/leave operations.
- **Feature 02 — Game Engine**: Tournament games are created as `Game` rows with a `tournamentId` foreign key. The game engine handles time controls and result reporting.
- **Feature 05 — Leaderboard**: Glicko-2 rating data is available on each player (used for seeding in Swiss pairing).

## Output Artifacts

- `backend/src/tournaments/tournaments.controller.ts` — REST endpoints
- `backend/src/tournaments/tournaments.service.ts` — business logic including join/leave/standings
- `backend/src/tournaments/tournaments.module.ts` — NestJS module
- `backend/src/tournaments/dto/create-tournament.dto.ts` — validated DTO
- `backend/src/tournaments/pairing/swiss.pairing.ts` — Swiss pairing algorithm
- `backend/src/tournaments/pairing/arena.pairing.ts` — Arena pairing
- `backend/src/tournaments/pairing/round-robin.pairing.ts` — Round Robin schedule generator
- `backend/src/tournaments/pairing/knockout.pairing.ts` — KO bracket
- `backend/src/tournaments/tournaments.processor.ts` — BullMQ job processor
- `backend/src/tournaments/tournaments-queue.module.ts` — BullMQ queue wiring
- `frontend/src/pages/Tournaments.jsx` — tournament list page
- `frontend/src/pages/TournamentDetail.jsx` — detail page with standings and join/leave
- `frontend/src/components/TournamentBracket.jsx` — KO bracket visualization

## Non-Goals (v1)

- Spectator mode for tournament games
- Prize pool or entry fee management
- Elo performance ratings per tournament
- Live commentary or streaming integration
- Custom tiebreak systems beyond Buchholz
- Pausing a tournament mid-event
