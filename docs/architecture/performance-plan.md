# Performance Plan: the low-cost chess benchmark

> Written 2026-10-09. Decision record: [ADR-0033](./ADR-0033-position-keyed-eval-cache.md).
> Runs **after** the security blockers in [`../infrastructure/ship-plan.md`](../infrastructure/ship-plan.md)
> Phase 0, unless Adi reprioritises. Each phase is its own `feature/*` branch off `dev`.

## Goal

Publish numbers showing this server analyses, stores and serves chess for less CPU, fewer
bytes and fewer Redis commands per game than a straightforward implementation (this
repo's own 2026-10-09 baseline), **without** worse move verdicts.

## The metrics (all reported per run, before vs after)

| Metric | How measured | Baseline 2026-10-09 | Target |
|---|---|---|---|
| Server CPU per analysed game | engine wall-time × threads, 80-ply median | ~95 s | < 10 s |
| Engine searches per game | count of `go` commands | 1 per ply (~80) | < 20 |
| Cache hit rate | hits ÷ plies, split opening / middlegame / endgame | 0% | > 60% overall |
| Verdict agreement with depth 18 | same classification as a full depth-18 sweep | 100% (by definition) | ≥ 98% |
| Bytes per stored game (moves) | `pg_column_size` of the move data | ~SAN array + PGN + FEN | ≤ 64 B for 80 plies |
| Bytes per stored analysis | `pg_column_size` | ~8 KB JSON | ≤ 300 B |
| Move round-trip latency | client send → `move_made`, p50 / p99 | measure in Phase 0 | measure first |
| Redis commands per move / per idle minute | `INFO commandstats` delta | measure in Phase 0 | idle → ~0 |

Targets are guesses until Phase 0 measures them. They get rewritten then, not defended.

---

## Phase 0 — Benchmark harness (`feature/bench-harness`)

> **Methodology note (2026-10-10).** `bench-live.mjs` counts (Redis commands, socket messages) are exact and
> repeatable. Its latency figure is a single 20-ply run on a dev laptop and is **noise-dominated**: the same
> code measured p50 1.8 ms / p99 5.2 ms on 2026-10-09 and 3.0–3.6 / 10.4–12.1 ms after the NestJS 11 upgrade,
> with the socket path untouched and debug logging ruled out. Before latency is published: N ≥ 5 runs,
> ≥ 200 plies each, report median and spread, on a quiet machine.

Nothing else starts until this exists.

- **Corpus:** a fixed sample of public Lichess games (e.g. 1,000 for quick runs, 10,000 for
  published runs), pinned by file name + checksum so runs are comparable. Licence
  checked first (the games export is separate from the eval export).
- **`backend/bench/analysis.mjs`:** runs each game through `AnalysisService` and records
  the CPU, search, hit-rate and agreement metrics. Writes JSON results to `bench/results/`.
- **`backend/bench/storage.mjs`:** inserts the corpus and reads back `pg_column_size`.
- **`backend/bench/live.mjs`:** extends `verify-clocks.mjs` style: N bot pairs play scripted
  games over sockets; records latency percentiles and Redis `commandstats` deltas,
  including a 60 s idle window.
- **Depth-18 reference:** a one-time full depth-18 sweep of the corpus, cached in a file,
  which the agreement metric compares against.

Done when: one command prints the table above for the current code.

## Phase 1 — Position cache (`feature/position-cache`)

- `PositionEval` table + migration (ADR-0033 §1 schema).
- `positionKey(chess)`: 4-field normalized FEN → 64-bit hash. Unit tests:
  - the same position reached by two move orders → same key;
  - side to move, castling and legal en passant each change the key;
  - an en passant square with no legal capture does **not** change the key;
  - halfmove/fullmove counters don't change the key;
  - the bypass rules trigger at halfmove ≥ 80 and on in-game repetition.
- `AnalysisService.sweep` checks the cache before each `evaluate()` and writes back after it.
- Collision guard: the stored `fen` must match, or it counts as a miss.

Done when: re-analysing the same corpus twice shows a ~100% hit rate on the second run, and
agreement is unchanged.

## Phase 2 — Lichess pre-fill (`feature/eval-prefill`)

- **Licence gate:** confirm the eval export's licence. If it isn't usable, skip this phase;
  Phase 1 still warms up from our own games.
- `backend/scripts/import-evals.mjs`: stream-decompress, keep positions within the first
  ~20 moves (or the top-N most frequent in the games corpus), normalize through chess.js,
  keep the highest-depth evaluation and its first PV move, then bulk `COPY`.
- Size budget: ≤ 1M rows (~16–30 MB) so it fits a free Postgres tier.
- `BOOK` classification (ADR-0033 §2 tier 1) + the label in the review UI.

Done when: opening-phase hit rate > 90% on the corpus.

## Phase 3 — Tiered search (`feature/tiered-analysis`)

- Tiers 4–6 from ADR-0033 §2: skip only-moves, depth-12 pass, depth-18 re-search only
  near the ADR-0027 thresholds.
- Margin is a single constant, tuned on the corpus until agreement ≥ 98%.
- Engine reuse: keep the hash table warm across a game's plies (no `ucinewgame` between
  plies of the same game — already the case; verify after the change).

Done when: searches per game and CPU per game drop, and agreement holds ≥ 98%.

## Phase 4 — Endgame tablebases (`feature/tablebase`)

- ≤ 5 pieces → probe. Start with `tablebase.lichess.org` (zero storage, but a network call;
  needs its own throttle and timeout). Switch to a local 5-piece Syzygy set (< 1 GB) only if
  the host's disk allows and the API proves slow.
- Results are exact, so they go in the cache with `source = tablebase` and never need re-checking.

## Phase 5 — Browser analysis (`feature/client-analysis`)

- The review page runs Stockfish WASM locally (the engine is already shipped for computer
  games, ADR-0009), using the same tiered algorithm, querying the server cache first.
- Results are saved only to that game's analysis, never to the shared cache, unless the
  server re-checks a random sample of plies and they match.
- Server analysis stays as the fallback (old or slow devices, phones).

Done when: server analysis CPU per game ≈ 0 for capable clients.

## Phase 6 — Compact storage (`feature/compact-storage`)

- Move codec: legal moves in a fixed heuristic order → index → Huffman (or arithmetic)
  code. Round-trip test over the whole corpus: `decode(encode(game)) === game`.
- Analysis codec: `int16` eval + `uint8` best-move index per ply; classification
  and accuracy recomputed by `classify.ts`.
- Migration: new `BYTEA` columns alongside the old ones → backfill → read new with fallback
  → drop old columns in a later release. PGN export and the review page read through the
  decoder.

Done when: bytes per game and per analysis hit their targets, and every verify script still
passes.

## Phase 7 — Live-play path (`feature/lean-realtime`)

> **Clock part done 2026-10-09** ([ADR-0034](./ADR-0034-event-driven-clock-sweeper.md)): idle Redis 60 → 0
> commands/min, per waiting game 72 → 4 commands and 120 → 0 socket messages per minute,
> flag-fall exact instead of ≤ 1 s late. Measured by `frontend/scripts/bench-live.mjs`
> (`bench/results/live-baseline.json` → `live-event-driven.json`). Matchmaking and the
> `move_made` payload are still open; the matchmaking poll already costs 0 with empty queues.

- Clock sweeper: `ZRANGEBYSCORE clock:deadlines -inf <now>`, only the expired rooms.
- `clock_sync`: only on moves (clients already count down locally); keep a slow
  safety-net sync (e.g. every 10 s), not every 1 s.
- Matchmaking: a rating-ordered sorted set per queue + a window lookup, replacing the
  O(n²) scan; no polling when every queue is empty.
- `move_made`: drop the duplicate `fen`; consider sending just the move + clocks and letting
  the client apply it.

Done when: Redis commands per idle minute ≈ 0, and latency p99 is no worse.

---

## Order and dependencies

```
Phase 0 harness ──► 1 cache ──► 2 pre-fill ──► 3 tiered ──► 4 tablebase
                        └──────────────► 5 client analysis (needs 1, best after 3)
Phase 0 harness ──► 6 storage      (independent of 1–5)
Phase 0 harness ──► 7 realtime     (independent; worth doing early for free-tier Redis quotas)
```

Phase 7 may be pulled forward: the idle Redis traffic it removes is also a free-tier
hosting risk (see `ship-plan.md`, "Free-tier risks").

## Decisions (2026-10-09)

1. **Headline goal.** This is Adi's portfolio centerpiece, so every phase ships a published
   before/after number, and Phase 0 gets a write-up with charts.
2. *Open:* is ≥ 98% agreement with depth 18 an acceptable definition of "no worse"?
3. **Phase 7 first.** Its clock part landed first (ADR-0034).
