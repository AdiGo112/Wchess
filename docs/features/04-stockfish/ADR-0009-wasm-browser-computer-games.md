# ADR-0009: Stockfish WASM in Browser Web Worker for Computer Games

**Status:** Accepted
**Date:** 2026-06-23

## Context
Computer games require the chess engine to compute a response move after each human move. Running this on the server means every active computer game consumes a dedicated CPU thread for potentially 1-3 seconds per move. With 100 concurrent computer games, this would saturate a typical server.

## Decision
Use Stockfish compiled to WebAssembly (via the `stockfish.js` npm package) running in a browser Web Worker. The computation happens on the user's device, consuming zero server CPU.

## Consequences
**Positive:** No server CPU cost for computer games, regardless of concurrent player count. Web Worker keeps the UI thread non-blocking. Works offline (after initial load). Stockfish WASM is production-quality — it's the same engine used by chess.com and lichess.org for client-side features.
**Negative:** WASM file is ~3.5MB. Mitigated by lazy-loading (only loaded when starting a computer game). Users on mobile devices may experience slower response times at higher depths.
**Neutral:** The server still validates all moves submitted by the WASM engine via chess.js (security: the browser could theoretically send any move; server validation prevents cheating).

---

## Addendum (2026-07-12) — implementation notes

The decision stands and is now implemented. Two corrections from actually building it:

1. **Size was underestimated.** The `stockfish` npm package (v18) ships a 113MB `.wasm` for
   the full NNUE net. The smallest build that does *not* require `SharedArrayBuffer` is
   `stockfish-18-lite-single` at **7.3MB**, not ~3.5MB. Still lazy-loaded, so it is fetched
   only when a computer game starts.
2. **Single-threaded on purpose.** The threaded builds need `SharedArrayBuffer`, which means
   serving the app cross-origin-isolated (COOP + COEP). That is a whole-app change with
   knock-on effects; the single-threaded build sidesteps it. Revisit only if engine strength
   at high difficulty proves inadequate.

**How the move gets back to the server:** via a dedicated `computer_move` socket event, *not*
the normal `move` event — `GameGateway.handleMove` rejects moves from a socket that does not
own the current turn, and in a computer game black is `{ id: 'computer' }`. The new handler
re-validates everything (room is vs-computer, sender is its human player, black to move,
chess.js legality). Computer games are unrated, so a tampered client gains nothing.

**Superseded:** the backend BullMQ `computer-move` worker described in
IMPLEMENTATION_PLAN_INCREMENT_1.md contradicted this ADR and has been deleted.
