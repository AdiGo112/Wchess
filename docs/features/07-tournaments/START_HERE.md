# Feature 07 — Tournaments: Start Here

## What This Feature Does

The Tournaments feature lets players create and participate in organized chess competitions with multiple formats: Swiss (default), Arena, Round Robin, and Knockout. A tournament has a lifecycle: UPCOMING (accepting registrations) → ONGOING (games being played) → COMPLETED (final standings available). State transitions are automatic: a BullMQ delayed job fires at `startAt` to kick off the first round, and subsequent rounds are advanced automatically when all games in a round complete or the round time limit expires.

Players join upcoming tournaments from a list page, view standings and pairings, and play their tournament games through the same game engine as regular games (Feature 02). The Swiss pairing algorithm groups players by score, pairs within score groups, avoids rematches, and issues a bye to the lowest-ranked player in an odd-count group.

## Branch and Reading Order

Work on branch `feature/07-tournaments` branched from `feature/06-chat` (or `main` if chat is not merged). The recommended reading order is:

1. **README.md** — goal, user story, dependencies
2. **ARCHITECTURE.md** — service map, data flow, file tree
3. **DOMAIN_MODEL.md** — Prisma models for Tournament, TournamentPlayer, Game.tournamentId
4. **API_DESIGN.md** — REST endpoints table and DTOs
5. **WORKFLOWS.md** — join flow, round advancement, standings calculation
6. **ADR-0015-swiss-pairing-default.md**, **ADR-0016-bullmq-cron-round-advancement.md**, **ADR-0017-tournament-lifecycle-states.md**
7. **IMPLEMENTATION_PLAN_INCREMENT_1.md** through **_6.md**
8. Use matching **IMPLEMENTATION_PROMPT_INCREMENT_N.md** files to drive each increment in a fresh AI session.

## Verification

After all 6 increments:
- Create a Swiss tournament via `POST /tournaments` with `startAt` 1 minute in the future.
- 4 test users join via `POST /tournaments/:id/join`.
- Wait for `startAt` — BullMQ fires, tournament transitions to ONGOING, round 1 games are created.
- Play all round 1 games to completion.
- BullMQ fires again — round 2 pairings are created.
- After all rounds, standings show players sorted by score then Buchholz tiebreak.
- Visit `/tournaments` in the browser — list shows the tournament. Visit `/tournaments/:id` — standings table and join/leave button render correctly.
