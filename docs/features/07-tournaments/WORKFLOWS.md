# Feature 07 — Tournaments: Workflows

## Workflow 1: Player Joins and Tournament Auto-Starts

1. User visits `/tournaments` in the browser. The frontend calls `GET /tournaments?status=UPCOMING` and renders a list of upcoming tournaments.
2. User clicks on a tournament. The frontend navigates to `/tournaments/:id` and calls `GET /tournaments/:id`. The detail page renders name, format, time control, player list, and a "Join" button.
3. User clicks "Join". The frontend calls `POST /tournaments/:id/join` with JWT header.
4. `TournamentsController` passes to `TournamentsService.join(tournamentId, userId)`:
   - Checks `tournament.status === 'UPCOMING'` — throws `400 NOT_UPCOMING` if not.
   - Checks `tournament.players.length < tournament.maxPlayers` — throws `409 TOURNAMENT_FULL` if full.
   - Checks no existing `TournamentPlayer` row — throws `409 ALREADY_JOINED` if duplicate.
   - Creates `TournamentPlayer` row.
5. Response `{ message: 'Joined' }` returned with 201. Frontend refreshes the detail page and shows the user in the player list. "Join" button changes to "Leave".
6. At `tournament.startAt`, the BullMQ delayed job `start-tournament:{tournamentId}` fires.
7. `TournamentsProcessor.handleStartTournament()`:
   - Loads the tournament and counts players. If < 4 players (for Swiss/RR/KO), sets `status = COMPLETED` and returns.
   - Sets `status = ONGOING`, `currentRound = 1`.
   - Calls `swissPairing.pairRound(tournament, players)` which returns an array of `{ whitePlayerId, blackPlayerId }` pairs plus optional bye player.
   - For each pair, calls `GameService.createGame({ whitePlayerId, blackPlayerId, timeControl, tournamentId, tournamentRound: 1 })`.
   - For the bye player (if any), sets `TournamentPlayer.hasBye = true` and `score += 1`.
   - Calculates `roundEndTime = now + roundDuration`. Enqueues BullMQ delayed job `advance-round:{tournamentId}:1` with delay = `roundDuration`.
8. Players in the tournament receive their game notifications via the normal game invitation flow (Feature 02).

## Workflow 2: Round Advancement After All Games Complete

1. Player wins a tournament game. `GameService.onGameComplete(game)` is called.
2. If `game.tournamentId` is set, `GameService` calls `TournamentsService.recordGameResult(game)`.
3. `recordGameResult`:
   - Updates winner's `score += 1` (or both `+= 0.5` for draw) in `TournamentPlayer`.
   - Recomputes Buchholz for both players.
   - Checks if all games in `tournament.currentRound` are completed: queries `Game` where `tournamentId = X AND tournamentRound = currentRound AND status != COMPLETED` — if count is 0, all done.
   - If all done, calls `TournamentsService.advanceRound(tournamentId)`.
4. `advanceRound`:
   - Cancels the pending `advance-round` BullMQ job (to avoid double advancement).
   - Increments `currentRound`.
   - If `currentRound > maxRounds`: sets `status = COMPLETED`. Done.
   - Otherwise: runs the appropriate pairing algorithm for round `currentRound`.
   - Creates `Game` rows for new pairings.
   - Enqueues new `advance-round` delayed job.
5. The BullMQ `advance-round` job is idempotent: it first checks `tournament.currentRound !== expectedRound`. If the round already advanced (because all games finished early), it returns immediately.

## Workflow 3: View Standings

1. User visits `/tournaments/:id` on the detail page.
2. Frontend calls `GET /tournaments/:id/standings`.
3. `TournamentsService.getStandings(tournamentId)`:
   - Queries all `TournamentPlayer` rows for this tournament.
   - Sorts by `score DESC`, then `buchholz DESC` (tiebreak), then `joinedAt ASC` (final tiebreak: earlier registration ranks higher among equal scores).
   - Assigns `rank` field (1-indexed).
   - Returns `StandingsDto[]`.
4. Frontend renders standings as a table: Rank | Player | Score | Buchholz | Games Played.
5. For ONGOING tournaments, standings are live: each game completion triggers a re-sort (no WebSocket push in v1 — user must refresh to see updates).
