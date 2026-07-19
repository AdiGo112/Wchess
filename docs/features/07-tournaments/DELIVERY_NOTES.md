# Feature 07 — Tournaments: Delivery Notes

## Definition of Done

- [ ] `POST /tournaments` creates a tournament and enqueues a BullMQ delayed job.
- [ ] `POST /tournaments/:id/join` registers a player and enforces UPCOMING status, max players, and no-duplicate rules.
- [ ] `DELETE /tournaments/:id/leave` removes a player and enforces UPCOMING-only rule.
- [ ] `GET /tournaments/:id/standings` returns players sorted by score DESC then Buchholz DESC.
- [ ] BullMQ job fires at `startAt` and creates round 1 game rows.
- [ ] When all round N games complete, round N+1 is paired automatically.
- [ ] When `currentRound > maxRounds`, tournament status becomes COMPLETED.
- [ ] Swiss pairing avoids rematches and correctly assigns byes.
- [ ] Round Robin pre-schedules all games upfront.
- [ ] Knockout advances only winners to the next round.
- [ ] Arena creates new pairings dynamically while the event is running.
- [ ] Frontend list page renders tournaments with status/format filters.
- [ ] Frontend detail page shows standings table and join/leave button.
- [ ] Frontend KO bracket visualization renders winners correctly.

## Acceptance Criteria

1. Create tournament with `format: SWISS`, `maxPlayers: 8`, `startAt: now+60s`. 8 users join. After 60s, `status` is ONGOING, 4 Game rows exist with `tournamentId` and `tournamentRound: 1`.
2. All 4 round 1 games complete. 4 new Game rows appear with `tournamentRound: 2`. Standings show updated scores.
3. After `maxRounds` rounds complete, `status` is COMPLETED.
4. A user tries to join after `startAt` — receives `400 NOT_UPCOMING`.
5. A user tries to join a full tournament — receives `409 TOURNAMENT_FULL`.
6. Round Robin with 4 players: exactly 6 games are scheduled upfront (4-1 = 3 rounds × 2 pairs = 6 games).
7. Knockout with 8 players: round 1 has 4 games, round 2 has 2 games, round 3 (final) has 1 game.

## Explicitly Out of Scope in v1

- Live standings WebSocket push (player must refresh to see updates)
- Pausing or cancelling an ongoing tournament
- Custom tiebreak systems
- Spectator mode
- Entry fees or prizes
- Team tournaments
- Time zone display in UI
- Email notifications for round start

## Known Edge Cases

- **Odd player count in Swiss**: The lowest-ranked player without a prior bye receives a bye. `hasBye` is set to true and they cannot receive another bye in subsequent rounds.
- **BullMQ job fires when round already advanced**: Idempotent check — job reads `tournament.currentRound` and compares to `expectedRound` stored in job data. If they differ, job returns immediately.
- **Knockout with non-power-of-2 player count**: Fill bracket with byes to reach the next power of 2. First-round byes are assigned to the highest-seeded players.
- **Player forfeits a tournament game**: If a game times out without moves, the game engine marks it ABORTED. For tournament purposes, treat ABORTED as a loss for the player who ran out of time (or both players lose if neither moved).
- **Arena tie at end of event**: Players with equal score are ranked by their best individual game performance (Sonneborn-Berger not implemented in v1 — alphabetical tiebreak as fallback).
