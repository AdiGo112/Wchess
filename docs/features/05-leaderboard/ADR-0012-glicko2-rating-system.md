# ADR-0012: Glicko-2 as the Rating System
**Status:** Accepted
**Date:** 2026-06-24

## Context
A rating system is needed to rank players. The simplest option is plain ELO. Alternatives considered: Glicko-1, Glicko-2, TrueSkill. The system needs to handle players who are inactive for long periods (their true skill is uncertain), players who are new (few games played, wide uncertainty), and separate ratings per time control variant.

## Decision
Use Glicko-2 for all player ratings. Glicko-2 extends ELO with two additional parameters per player:
- **Rating Deviation (RD):** Uncertainty in the rating. New players start high (350), converges toward ~50 with games.
- **Volatility (σ):** How erratic a player's performance is. Used to adjust RD between rating periods.

Implementation lives in `backend/src/utils/elo.ts` and exposes `updateGlicko2()` and `getRatingChange()`. Each variant (bullet/blitz/rapid/classical) has a separate row in the `UserRating` PostgreSQL table.

Rating period: applied per-game (not batched) for immediate leaderboard updates. This is a simplification of the full Glicko-2 spec (which suggests batching), but acceptable for real-time feedback.

## Consequences
**Positive:** New players' ratings stabilize faster than plain ELO. Inactive players' uncertainty increases (RD rises), so returning players have lower leaderboard impact until they play enough games. Per-variant ratings mean a bullet specialist doesn't pollute the classical leaderboard.

**Negative:** More complex than ELO — three parameters per player per variant instead of one. Explaining RD to users requires UI care ("rating ± X" format). Per-game application (not batched) is a spec deviation that slightly reduces theoretical accuracy.

**Neutral:** Starting rating 1500, starting RD 350, starting volatility 0.06 — standard Glicko-2 defaults.
