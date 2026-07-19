# ADR-0026: Use Stockfish at Depth 18 for Post-Game Analysis

**Status:** Accepted
**Date:** 2026-06-24

## Context

Post-game analysis requires evaluating every position in a completed chess game using the Stockfish engine. The engine's analysis depth directly affects both the quality of the evaluation and the time required to compute it.

Common depth choices in production chess apps:
- **Depth 12-14**: Fast (< 1 second per position on commodity hardware), but misses many tactical sequences beyond 6-7 plies. Analysis is often inaccurate in sharp positions.
- **Depth 18**: Moderate (1-3 seconds per position), catches most tactical sequences, provides strong evaluation accuracy for club-level and intermediate play.
- **Depth 22-25**: Slow (5-15 seconds per position), high accuracy, but for a 40-move game this could take 10+ minutes per analysis job — unacceptable for a near-real-time system.
- **Infinite + time limit**: Stockfish runs until a fixed time per position (e.g., 3 seconds). More predictable time budget but requires calibration per hardware.

ChessWeb is an async system — analysis results are fetched by polling, so the user is not blocked. However, the total time from game end to analysis ready should be under 60 seconds for a typical 30-40 move game to deliver a good user experience.

At depth 18 on a modern server (4-core, 4GB RAM), each position evaluation takes approximately 0.5-2 seconds. A 40-move game (80 plies = 80 position evaluations) therefore takes 40-160 seconds total. This is borderline — optimizations such as reusing the transposition table across moves or parallelizing evaluations would help but add complexity.

## Decision

Use Stockfish at a fixed depth of 18 for all post-game analysis in v1. This provides strong tactical accuracy for the target audience (casual to intermediate players, ELO < 1800 where depth 18 is more than sufficient to identify blunders and mistakes). The depth is hardcoded in the `StockfishAnalysisProcessor` and can be made configurable via environment variable (`ANALYSIS_DEPTH`) in a future increment without changing the core architecture.

## Consequences

**Positive:**
- Strong analysis quality — finds all obvious blunders, most mistakes, and many inaccuracies for club players.
- Deterministic behavior — same depth on same hardware means consistent job times and reliable BullMQ job timeout settings.
- Acceptable for the target user base (players below 1800 ELO do not need GM-level depth-25 analysis to benefit from post-game review).

**Negative:**
- Job time can reach 30-60 seconds for longer games (40+ moves), which is the boundary of acceptable UX for an async flow with polling.
- For very sharp tactical positions (sacrifices, forced mates), depth 18 occasionally misses the winning sequence, leading to slightly inaccurate centipawn loss calculations. This is unlikely to affect the move classification for casual players.
- Running Stockfish at depth 18 sequentially (one position at a time) is CPU-intensive. With `concurrency: 2` on the BullMQ processor, two simultaneous jobs will use 100% of a dual-core server. Infrastructure must be sized accordingly.

**Neutral:**
- Depth 18 is the same depth used by Lichess for their free analysis tool, making the results familiar and expected to existing chess players.
