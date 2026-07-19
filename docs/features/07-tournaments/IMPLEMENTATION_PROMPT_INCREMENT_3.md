# Feature 07 — Tournaments: Increment 3 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 3 of the Tournaments feature for ChessWeb: the Swiss pairing algorithm. This is a pure TypeScript function with no database dependencies.

## Existing Codebase State

Increments 1 and 2 are complete. There is no pairing logic yet. The `TournamentsService` has a placeholder `pairRound()` method that throws "Not implemented".

## File to Create

### `backend/src/tournaments/pairing/swiss.pairing.ts`

Implement a pure function:

```typescript
export interface TournamentPlayerInput {
  userId: string;
  username: string;
  score: number;
  buchholz: number;
  hasBye: boolean;
  rating: number; // For initial seeding when scores are tied
}

export interface PreviousGame {
  whitePlayerId: string;
  blackPlayerId: string;
}

export interface PairingResult {
  pairs: Array<{ whitePlayerId: string; blackPlayerId: string }>;
  bye: string | null; // userId of the player who receives a bye, or null
}

export function pairRound(
  players: TournamentPlayerInput[],
  previousGames: PreviousGame[],
): PairingResult {
  // Implementation described below
}
```

### Algorithm Implementation

```
Step 1: Sort players by score DESC, buchholz DESC, rating DESC.

Step 2: Build a "faced" set for quick rematch lookup:
  const faced = new Map<string, Set<string>>();
  for each previousGame:
    faced.get(whiteId).add(blackId)
    faced.get(blackId).add(whiteId)

Step 3: Determine bye player (if odd count):
  - Filter players who have NOT had a bye (hasBye === false)
  - The bye player is the last (lowest-ranked) player in this filtered list
  - If all players have had a bye, the bye goes to the lowest-ranked overall
  - Remove the bye player from the active pairing list

Step 4: Pair remaining players:
  Use a greedy algorithm with backtracking:
  - Sort remaining players by score DESC
  - Try to pair player[0] with player[1]. If they have faced each other, try player[2], player[3], etc.
  - Once a pair is found, remove both from the list and repeat.
  - Color assignment: alternate colors. Player with fewer wins as white gets white. If equal, random.
  
Step 5: Return { pairs, bye: byePlayerId | null }
```

Color Assignment Rule:
- Track color history for each player (not available in this increment — assign white to the higher-ranked player for now, alternating if they have played the same number of games as white).
- Simple rule: in round 1, white goes to the higher-seed. In subsequent rounds, the player who most recently played as black gets white. If equal, random.

Rematch Fallback:
- If no perfect pairing exists without rematches (common in late rounds of small tournaments), allow rematches. The algorithm tries all permutations for small groups (≤ 6 players) and uses greedy for larger groups.

## Test File to Create

### `backend/src/tournaments/pairing/swiss.pairing.spec.ts`

```typescript
import { pairRound } from './swiss.pairing';

const makePlayer = (userId: string, score: number, hasBye = false, rating = 1200) =>
  ({ userId, username: userId, score, buchholz: 0, hasBye, rating });

describe('Swiss Pairing', () => {
  it('pairs 4 equal-score players into 2 pairs with no bye', () => {
    const players = ['A','B','C','D'].map(id => makePlayer(id, 0));
    const result = pairRound(players, []);
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).toBeNull();
    const allPlayers = result.pairs.flatMap(p => [p.whitePlayerId, p.blackPlayerId]);
    expect(new Set(allPlayers).size).toBe(4); // No duplicates
  });

  it('assigns a bye to odd player with no prior bye', () => {
    const players = ['A','B','C','D','E'].map(id => makePlayer(id, 0));
    const result = pairRound(players, []);
    expect(result.pairs).toHaveLength(2);
    expect(result.bye).not.toBeNull();
    expect(['A','B','C','D','E']).toContain(result.bye);
  });

  it('avoids rematches', () => {
    const players = ['A','B','C','D'].map(id => makePlayer(id, 1));
    const previous = [{ whitePlayerId: 'A', blackPlayerId: 'B' }];
    const result = pairRound(players, previous);
    const hasRematch = result.pairs.some(p =>
      (p.whitePlayerId === 'A' && p.blackPlayerId === 'B') ||
      (p.whitePlayerId === 'B' && p.blackPlayerId === 'A')
    );
    expect(hasRematch).toBe(false);
  });

  it('pairs higher-score players together', () => {
    const players = [
      makePlayer('A', 2),
      makePlayer('B', 2),
      makePlayer('C', 0),
      makePlayer('D', 0),
    ];
    const result = pairRound(players, []);
    const topPair = result.pairs.find(p =>
      (p.whitePlayerId === 'A' || p.blackPlayerId === 'A') &&
      (p.whitePlayerId === 'B' || p.blackPlayerId === 'B')
    );
    expect(topPair).toBeDefined();
  });

  it('does not give bye to player who already has one', () => {
    const players = [
      makePlayer('A', 0, false),
      makePlayer('B', 0, false),
      makePlayer('C', 0, false),
      makePlayer('D', 0, true), // D already had a bye
      makePlayer('E', 0, false),
    ];
    const result = pairRound(players, []);
    expect(result.bye).not.toBe('D');
  });
});
```

## Verification

```bash
cd backend && npx jest swiss.pairing.spec.ts
# All 5 tests should pass
```
