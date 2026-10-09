# ADR-0033: Position-Keyed Evaluation Cache, Tiered Analysis, Compact Storage

**Status:** Proposed
**Date:** 2026-10-09
**Amends:** ADR-0026 (depth 18 becomes the *ceiling*, not the depth every ply gets)
**Related:** ADR-0009 (Stockfish WASM in the browser), ADR-0027 (classification thresholds),
ADR-0028 (ECO table), ADR-0032 (single instance)
**Plan:** [`performance-plan.md`](./performance-plan.md)

## Context

The product goal is chess that is **measurably** the cheapest to run, in computation and in
storage, published as a benchmark. Today's costs (measured 2026-10-09):

- **Analysis CPU.** `analysis.service.ts` runs Stockfish at depth 18 (2 s ceiling) on
  **every ply of every game**, on one engine, one game at a time. An 80-ply game took
  **~95 s** in `verify-analysis.mjs`. The same opening positions are searched again in
  every game that reaches them.
- **Analysis storage.** `GameAnalysis.moves` is JSON, about 100 bytes per ply, and it stores
  `classification` and `cpLoss`, which `classify.ts` can derive from the evals.
- **Game storage.** `Game` stores the moves three times: `moves String[]`, `pgn`, and the
  final `fen`.

Most positions in the opening, and many in the middlegame, have already been evaluated:
by an earlier game on this server, or in Lichess's public evaluation export
(~395M positions, `lichess_db_eval.jsonl.zst`, one JSON record per FEN).

## Decision

### 1. One shared cache keyed by *position*, not by game or move number

A table `PositionEval` keyed by a 64-bit hash of a **normalized key FEN**. The key FEN is the
first four FEN fields:

| Field | In key | Reason |
|---|---|---|
| Piece placement | ✅ | the board |
| Side to move | ✅ | the same board with the other side to move is a different position |
| Castling rights | ✅ | a moved king or rook removes options permanently |
| En passant square | ✅, **only if an en passant capture is legal** | otherwise identical positions get different keys and the cache misses |
| Halfmove clock | ❌ | rarely changes the evaluation (but see the bypass rules below) |
| Fullmove number | ❌ | never changes the evaluation |

This is the same identity Stockfish's transposition table uses. chess.js 1.4 already
writes the en passant square only when the capture is legal (checked 2026-10-09). Imported
FENs are passed through chess.js so they normalize the same way.

**Bypass rules.** Don't read or write the cache when either holds:
- halfmove clock ≥ 80, because the 50-move rule can turn a "win" into a draw;
- the position already appeared earlier in this game, because repetition can make it a draw.

The stored evaluation knows about neither.

**Row:** `hash BIGINT PK, fen TEXT, evalCp SMALLINT, mate SMALLINT NULL, bestMove CHAR(5),
depth SMALLINT, source SMALLINT` (lichess import / server / verified-client).
`fen` is stored so a hash collision is detected rather than trusted. On a hash match with a
different FEN, the cache counts as a miss.

**Trust:** only the server and the Lichess import write rows. Results computed in a player's
browser never enter the shared cache unverified (see §3).

### 2. Tiered analysis: spend engine time only where the verdict is uncertain

For each ply, stop at the first tier that answers:

1. **Book.** The positions before and after the move are both cached from the Lichess
   import → classified `BOOK`, no engine work.
2. **Cache hit** at depth ≥ the tier's target → use it.
3. **Tablebase.** ≤ 5 pieces → exact result from Syzygy (local 5-piece set, < 1 GB) or
   `tablebase.lichess.org`.
4. **Only move / forced.** A single legal move → no search needed for the verdict.
5. **Shallow pass.** Depth 12 → classify with `classify.ts`.
6. **Deep pass.** Only if the shallow centipawn loss lands within a margin of an
   ADR-0027 threshold (inaccuracy / mistake / blunder) or the eval swings past mate
   bounds → re-search at depth 18 (still capped at `MOVETIME_MS`).

Every engine result from steps 5–6 is written to the cache. Depth 18 stays the quality
ceiling, as ADR-0026 intended, but becomes the exception rather than the rule.

### 3. Analysis may run in the player's browser

ADR-0009 already ships Stockfish WASM to the client. A browser-run review costs the server
nothing. Its results are stored **only on that player's own game**, never in the shared
cache. To contribute to the shared cache, the server must re-check a sample of plies
first. Analysis is never rated, so a tampered client can only mislead itself.

### 4. Compact storage

- **Moves:** one `BYTEA` per game. For each ply, list the legal moves in a fixed heuristic
  order, store the index of the move played, and entropy-code the indices (Lichess-style).
  Published results reach ~3.7 bits/move. `pgn` and final `fen` are **derived on read**, not
  stored.
- **Analysis:** one `BYTEA` per game. Per ply, `int16` eval (mate encoded out of range) plus
  a best-move index (`uint8`) ≈ 3 bytes. `classification`, `cpLoss` and accuracy are
  **recomputed** by `classify.ts` on read. It's a pure function, and the 14 existing tests
  pin its behaviour.

### 5. Benchmark before optimizing

Every step above lands only with a before/after number from the benchmark harness in the
plan. A step that doesn't move a metric is reverted.

## Consequences

**Good**
- Analysis CPU falls with traffic instead of rising with it: the more games played, the
  higher the hit rate.
- Openings cost no engine time from day one (Lichess pre-fill).
- Storage per game drops by roughly two orders of magnitude (target in the plan).
- Fits a free tier: a 1M-position cache is ~16–30 MB.

**Bad / costs**
- **Accuracy risk.** Shallow-then-deep can disagree with a full depth-18 sweep. The
  benchmark must report agreement with depth 18, and the margins get tuned until it
  stays ≥ 98%.
- **Migrations.** `Game.moves`/`pgn`/`fen` and `GameAnalysis.moves` change format.
  Requires a backfill and a read path that handles both formats during the switch.
- **Custom codec.** The move encoder/decoder is new code on the persistence path, and
  needs round-trip tests over a large game sample.
- **Licence unverified.** The Lichess eval export's licence was **not confirmed**
  (2026-10-09). Confirm it on database.lichess.org before importing. If it isn't usable,
  the cache still works; it just starts cold.
- **Different evaluation sources.** Lichess evals come from various Stockfish versions run
  in browsers. Rows record `source` and `depth`, so a server re-check can replace any row.

## Alternatives considered

- **Cache keyed by move number ("first 10–15 moves").** Rejected: it misses transpositions
  (same position, different move order) and stops working the moment a game leaves the
  expected line.
- **Cache by full FEN (all six fields).** Rejected: the move counters make otherwise-identical
  positions miss each other.
- **Raise or lower one fixed depth.** Rejected: one number trades quality against cost
  everywhere. Tiering spends depth only where it changes the verdict.
- **Postgres JSON compression (TOAST) only.** Free, but it compresses verbose data rather
  than removing it. It doesn't approach a few bytes per ply.
