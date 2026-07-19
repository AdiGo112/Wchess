# 04-Stockfish — Increment 3 ✅ DONE (2026-07-12)

## Scope
Frontend WASM worker: Stockfish WASM in a Web Worker, 5 difficulty levels, move response to board.

## Files created (as built)
- `frontend/src/hooks/useStockfish.js` — the Web Worker *is* the engine build, so no
  separate `stockfish.worker.ts` wrapper was needed. `new Worker('/engine/…js')` and speak UCI to it.
- `frontend/scripts/copy-engine.mjs` — copies the engine out of `node_modules` into
  `public/engine/` on `predev` / `prebuild`. `public/engine` is gitignored (7.3MB binary
  does not belong in the repo).

## Engine build choice — read before changing
`npm i stockfish` (v18) ships several builds. We use **`stockfish-18-lite-single`**:

| Build | .wasm size | Needs SharedArrayBuffer? |
|---|---|---|
| `stockfish-18` (full NNUE) | **113 MB** | yes |
| `stockfish-18-lite` | 7.1 MB | yes (threaded) |
| **`stockfish-18-lite-single`** | **7.3 MB** | **no** ✅ |

The threaded builds need `SharedArrayBuffer`, which requires serving the whole app
cross-origin-isolated (COOP + COEP headers) — that would break other embeds and is a
big change for a single feature. The single-threaded build avoids it entirely.

> ADR-0009 estimated "~3.5MB" for the WASM. That was optimistic: the real floor for a
> header-free build is **7.3MB**, and the full engine is 113MB. Lazy-loaded, so it is
> only fetched when a player actually starts a computer game.

## Difficulty mapping (1–5 → UCI)
Both knobs move together — skill level alone still finds strong moves given enough time.

| Difficulty | `Skill Level` | `go movetime` |
|---|---|---|
| 1 | 0 | 200ms |
| 2 | 5 | 400ms |
| 3 | 10 | 600ms |
| 4 | 15 | 900ms |
| 5 | 20 | 1500ms |

## Acceptance criteria
- ✅ Web Worker initializes Stockfish WASM on first computer game (only then — hook is gated on `enabled`)
- ✅ `getBestMove(fen)` returns a UCI move parsed to `{ from, to, promotion }`
- ✅ UI thread not blocked during computation (Web Worker)
- ✅ Thinking indicator shown while Stockfish computes

## Verified
`uci-check`: drove the real engine binary with the hook's exact command sequence
(`uci` → `setoption name Skill Level` → `isready` → `position fen` → `go movetime`) at all
5 levels; every level returned a legal black move, and skill visibly changes the choice.
