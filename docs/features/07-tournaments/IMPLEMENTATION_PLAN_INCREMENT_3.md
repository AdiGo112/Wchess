# Feature 07 — Tournaments: Increment 3 Implementation Plan

## Scope

Swiss pairing algorithm: `pairRound()` pure function that groups by score, pairs within groups, avoids rematches, and assigns a bye to the lowest-ranked odd-count player who hasn't had one yet.

## Files Created / Modified

| File | Action |
|------|--------|
| `backend/src/tournaments/pairing/swiss.pairing.ts` | Create |
| `backend/src/tournaments/tournaments.service.ts` | Modify (use swiss pairing in pairRound method stub) |

## Acceptance Criteria

- [ ] 4 players, all equal score, no prior games: returns 2 pairs, each player appears exactly once, bye is null.
- [ ] 5 players (odd): returns 2 pairs + 1 bye player. Bye player is the lowest-ranked player who has not previously had a bye.
- [ ] Players with different scores: players in the same score group are paired together before crossing score groups.
- [ ] Rematch avoidance: if `previousGames` contains game between players A and B, `pairRound` does not return pair `[A, B]`.
- [ ] When rematch unavoidance is impossible (all opponents have been faced), cross-group pairings are allowed as a fallback.
- [ ] A player who already has a bye cannot receive a second bye unless all players have had one.
- [ ] `pairRound` is a pure function with no DB calls — takes players array and previousGames array as parameters.

## Complexity

**M (Medium)** — The algorithm itself is well-understood but the backtracking rematch-avoidance and bye assignment require careful implementation. The pure function approach makes it highly testable.
