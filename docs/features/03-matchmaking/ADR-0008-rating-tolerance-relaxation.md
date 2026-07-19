# ADR-0008: Rating Tolerance Relaxation (±50 → ±400 over 30s)

**Status:** Accepted
**Date:** 2026-06-23

## Context
Strict rating tolerance (e.g., ±50 at all times) would cause very long waits for players at unusual ratings. But too-loose tolerance immediately would give 1200 players vs 1800 players, which is a poor experience. We needed a dynamic tolerance.

## Decision
Start at ±50 rating points at enqueue time. Expand by 12 points per second of waiting. Cap at ±400 after 30 seconds.

Formula: `tolerance = Math.min(50 + waitSeconds * 12, 400)`

At t=0: ±50. At t=10: ±170. At t=20: ±290. At t=30+: ±400.

## Consequences
**Positive:** Players are matched quickly with a close opponent if one exists. If not, they wait up to 30s and are then matched with anyone within ±400 (roughly two skill tiers). No player waits indefinitely.
**Negative:** A 1200 and a 1600 player could be matched after 30s. This is a degraded experience vs. being unmatched, but acceptable for a v1 product.
**Neutral:** The 30-second threshold was chosen based on user research: most chess players consider 30s an acceptable wait for quick games.
