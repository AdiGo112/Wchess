# ADR-0015: Swiss Pairing as Default Tournament Format

**Status:** Accepted
**Date:** 2026-06-24

## Context

ChessWeb needs to choose a default tournament format for new events. The primary options are:
- **Swiss**: Players are paired each round based on score; everyone plays every round; no elimination. Standard in FIDE-rated events.
- **Round Robin**: Everyone plays everyone else. Produces a definitive ranking but scales poorly (N players → N*(N-1)/2 games).
- **Knockout**: Single elimination. Half the field is eliminated each round. Dramatic but players who lose early are done.
- **Arena**: Continuous event where players can join any time and play as many games as possible within a time window.

For a general-purpose chess platform, Swiss is the most familiar format to competitive chess players. It handles odd player counts gracefully with byes, works for any number of players from 4 to hundreds, and produces fair results in `ceil(log2(N))` rounds without requiring every player to play every other player.

## Decision

Swiss is the default format when creating a tournament if no format is specified. The `format` field defaults to `SWISS` in the `CreateTournamentDto`. All four formats (Swiss, Arena, Round Robin, Knockout) are supported as explicit options.

## Consequences

**Positive:**
- Familiar to competitive chess players — Swiss is used in most FIDE-rated club events.
- Handles odd player counts gracefully via the bye system.
- Efficiently produces ranked results in `ceil(log2(N))` rounds.
- Widely understood tiebreak system (Buchholz).

**Negative:**
- Swiss pairing algorithm is more complex than Round Robin scheduling or KO bracket assignment. The backtracking rematch-avoidance logic requires careful implementation and thorough testing.
- Byes introduce a slight unfairness to the player who receives a free point without playing.

**Neutral:**
- The pairing algorithm is a pure function (`pairRound(players, previousGames) => pairs`) and can be replaced with a stronger implementation (e.g., Monrad system) without changing the module interface.
