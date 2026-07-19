# 04-Stockfish — Increment 1

> **⚠️ SUPERSEDED (2026-07-12).** This plan originally specified a backend BullMQ
> `computer-move` worker that computed the engine's reply server-side and published it
> to the GameGateway over Redis pub/sub. **That contradicted ADR-0009**, which is the
> accepted decision and says computer moves run as Stockfish WASM *in the player's
> browser* precisely so they cost the server no CPU.
>
> The contradiction was live in the code for a while: `game.gateway.ts` enqueued a
> `computer-move` job, and `stockfish.processor.ts` computed a heuristic move and then
> only logged it — the result never reached the client, so vs-computer games hung after
> White's first move.
>
> **Resolution:** ADR-0009 wins. The computer-move worker is deleted. The engine path is
> now Increments 3 + 4 (both complete — see below). This increment retains only the
> analysis-worker scaffolding, which Increment 2 builds on.

## Scope (as built)
Backend BullMQ scaffolding for **analysis only**: `stockfish.module.ts`,
`stockfish.service.ts` (`queueAnalysis`), `stockfish.processor.ts` (`@Process('analysis')`).

There is **no** `computer-move` job and **no** `queueMove` producer. Do not re-add them.

## Removed in the ADR-0009 reconciliation
- `StockfishProcessor.handleComputerMove` and its captures-then-checks-then-random heuristic
- `StockfishService.queueMove`
- `GameGateway.emitComputerMove` (replaced by the `computer_move` socket handler)
- The `StockfishModule` import in `GamesModule` (the gateway no longer touches Stockfish)

## Acceptance criteria
- Analysis jobs can be enqueued and processed (depth handling lands in Increment 2)
- No server-side computation of computer-game moves anywhere in the backend

## Complexity: S (Small) — scaffolding only
