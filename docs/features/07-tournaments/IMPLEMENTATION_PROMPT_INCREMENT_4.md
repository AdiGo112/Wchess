# Feature 07 — Tournaments: Increment 4 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 4 of the Tournaments feature for ChessWeb: the Arena, Round Robin, and Knockout pairing algorithms. Increment 3 (Swiss pairing) is already complete.

## Existing Codebase State

- `backend/src/tournaments/pairing/swiss.pairing.ts` exists and exports `pairRound(players, previousGames): PairingResult`
- The `TournamentPlayerInput` and `PreviousGame` interfaces are defined in `swiss.pairing.ts`
- No other pairing files exist yet

## Files to Create

### `backend/src/tournaments/pairing/round-robin.pairing.ts`

```typescript
export interface RoundRobinRound {
  roundNumber: number;
  pairs: Array<{ whitePlayerId: string; blackPlayerId: string }>;
}

/**
 * Generates a complete Round Robin schedule using the circle method.
 * For N players: N-1 rounds, each round has N/2 pairings.
 * If N is odd, one player gets a bye each round.
 */
export function scheduleAll(playerIds: string[]): RoundRobinRound[] {
  const n = playerIds.length;
  const players = [...playerIds];
  // If odd, add a "BYE" placeholder
  if (n % 2 !== 0) players.push('BYE');
  const count = players.length;
  const rounds: RoundRobinRound[] = [];

  for (let round = 0; round < count - 1; round++) {
    const pairs: Array<{ whitePlayerId: string; blackPlayerId: string }> = [];
    for (let i = 0; i < count / 2; i++) {
      const white = players[i];
      const black = players[count - 1 - i];
      if (white !== 'BYE' && black !== 'BYE') {
        // Alternate colors each round: if even round, use as-is; if odd, flip
        if (round % 2 === 0) {
          pairs.push({ whitePlayerId: white, blackPlayerId: black });
        } else {
          pairs.push({ whitePlayerId: black, blackPlayerId: white });
        }
      }
    }
    rounds.push({ roundNumber: round + 1, pairs });
    // Rotate: keep players[0] fixed, rotate the rest
    players.splice(1, 0, players.pop()!);
  }

  return rounds;
}
```

### `backend/src/tournaments/pairing/knockout.pairing.ts`

```typescript
export interface KnockoutPair {
  whitePlayerId: string;
  blackPlayerId: string;
  isBye: boolean; // true if one side is a virtual bye
}

/**
 * Seeds players for knockout tournament.
 * Players must be pre-sorted by rating DESC (seeding).
 * Round 1: seed 1 vs seed N, seed 2 vs seed N-1, etc.
 * If player count is not a power of 2, top seeds get first-round byes.
 */
export function seedBracket(playerIds: string[]): KnockoutPair[] {
  const n = playerIds.length;
  const nextPow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  // Pad with BYE entries
  const padded = [...playerIds];
  while (padded.length < nextPow2) padded.push('BYE');

  const pairs: KnockoutPair[] = [];
  for (let i = 0; i < nextPow2 / 2; i++) {
    const white = padded[i];
    const black = padded[nextPow2 - 1 - i];
    pairs.push({
      whitePlayerId: white === 'BYE' ? black : white,
      blackPlayerId: black === 'BYE' ? white : black,
      isBye: white === 'BYE' || black === 'BYE',
    });
  }
  return pairs;
}

/**
 * Given winners of the previous round (in bracket order), generate next round pairings.
 */
export function pairNextRound(winners: string[]): KnockoutPair[] {
  const pairs: KnockoutPair[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    pairs.push({
      whitePlayerId: winners[i],
      blackPlayerId: winners[i + 1],
      isBye: false,
    });
  }
  return pairs;
}
```

### `backend/src/tournaments/pairing/arena.pairing.ts`

```typescript
export interface ArenaPlayer {
  userId: string;
  isAvailable: boolean; // Not currently in a game
  score: number;
}

export interface RecentGame {
  playerAId: string;
  playerBId: string;
  startedAt: Date;
}

/**
 * Pairs available players for an Arena event.
 * Players are sorted by score DESC. Each player is paired with the nearest
 * available opponent they haven't played in the last 5 games.
 */
export function pairAvailable(
  players: ArenaPlayer[],
  recentGames: RecentGame[],
): Array<{ whitePlayerId: string; blackPlayerId: string }> {
  const available = players
    .filter(p => p.isAvailable)
    .sort((a, b) => b.score - a.score);

  // Build recent opponent map
  const recentOpponents = new Map<string, Set<string>>();
  for (const p of available) recentOpponents.set(p.userId, new Set());
  for (const game of recentGames.slice(-5 * available.length)) {
    recentOpponents.get(game.playerAId)?.add(game.playerBId);
    recentOpponents.get(game.playerBId)?.add(game.playerAId);
  }

  const pairs: Array<{ whitePlayerId: string; blackPlayerId: string }> = [];
  const paired = new Set<string>();

  for (let i = 0; i < available.length; i++) {
    const p1 = available[i];
    if (paired.has(p1.userId)) continue;
    for (let j = i + 1; j < available.length; j++) {
      const p2 = available[j];
      if (paired.has(p2.userId)) continue;
      if (recentOpponents.get(p1.userId)?.has(p2.userId)) continue;
      // Found a valid pairing
      pairs.push({ whitePlayerId: p1.userId, blackPlayerId: p2.userId });
      paired.add(p1.userId);
      paired.add(p2.userId);
      break;
    }
  }
  return pairs;
}
```

## Update TournamentsService

In `backend/src/tournaments/tournaments.service.ts`, add a `dispatchPairing(tournament, players, previousGames)` method that calls the appropriate pairing function based on `tournament.format`:

```typescript
private async dispatchPairing(tournament: Tournament, players: TournamentPlayer[], previousGames: Game[]) {
  switch (tournament.format) {
    case 'SWISS':
      return swissPairing.pairRound(players, previousGames);
    case 'ROUND_ROBIN':
      // RR schedules all rounds upfront — this should only be called once at start
      const schedule = roundRobinSchedule.scheduleAll(players.map(p => p.userId));
      return { pairs: schedule[tournament.currentRound - 1]?.pairs ?? [], bye: null };
    case 'KNOCKOUT':
      if (tournament.currentRound === 1) {
        const seeded = [...players].sort((a, b) => b.user.rating - a.user.rating);
        const bracket = knockoutPairing.seedBracket(seeded.map(p => p.userId));
        return { pairs: bracket.filter(p => !p.isBye), bye: null };
      } else {
        const winners = await this.getKnockoutWinners(tournament.id, tournament.currentRound - 1);
        return { pairs: knockoutPairing.pairNextRound(winners), bye: null };
      }
    default:
      throw new Error(`Unsupported format: ${tournament.format}`);
  }
}
```

## Verification

```bash
cd backend && npx jest pairing --testPathPattern="arena|round-robin|knockout"
# All pairing algorithm tests should pass
```
