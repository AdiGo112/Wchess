# Feature 07 — Tournaments: Increment 4 Implementation Plan

## Scope

Arena, Round Robin, and Knockout pairing algorithms. Three additional pure functions alongside the Swiss pairing from Increment 3.

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/src/tournaments/pairing/arena.pairing.ts` | Create |
| `backend/src/tournaments/pairing/round-robin.pairing.ts` | Create |
| `backend/src/tournaments/pairing/knockout.pairing.ts` | Create |
| `backend/src/tournaments/tournaments.service.ts` | Modify (add format dispatch to pairRound) |

## Acceptance Criteria

**Round Robin**:
- [ ] `scheduleAll(4 players)` returns exactly 3 rounds, each with exactly 2 pairings.
- [ ] Each unique pair `(A, B)` appears exactly once across all rounds.
- [ ] No player appears in more than one game per round.
- [ ] Uses the standard round-robin scheduling algorithm (rotate one team, fix one player).

**Knockout**:
- [ ] `pairRound(8 seeded players, round=1)` returns 4 pairings: seed 1 vs seed 8, seed 2 vs seed 7, seed 3 vs seed 6, seed 4 vs seed 5.
- [ ] `pairRound(5 players, round=1)` returns 4 pairings — top 3 seeds get byes (virtual opponents), seeds 4 and 5 play each other.
- [ ] Only winners are passed to `pairRound` for subsequent rounds.

**Arena**:
- [ ] `pairAvailable(available players, recent games)` pairs players who have not recently played each other and are available (not currently in a game).
- [ ] Returns as many pairs as possible from available players.
- [ ] Avoids same-pair playing twice within the last 5 games.

## Complexity

**M (Medium)** — Round Robin algorithm (standard round-robin scheduling) is well-known. KO bracket seeding is straightforward. Arena pairing is the most novel but simpler than Swiss.
