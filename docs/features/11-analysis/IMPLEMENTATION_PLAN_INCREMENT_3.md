# Feature 11 — Increment 3: ECO Opening Identification

## Scope of Work

Add the ECO opening identification step to the analysis pipeline. This includes creating the `eco.json` data file, the `EcoLookup` utility, and wiring it into the `StockfishAnalysisProcessor` so that `ecoCode`, `ecoName`, and `ecoFamily` are stored on the completed analysis document.

## Files Created

- `backend/src/utils/eco-lookup.ts`
- `backend/data/eco.json` (at least 20 opening entries)

## Files Modified

- `backend/src/stockfish/stockfish.processor.ts` — call `identify(uciMoves)` at the end of processing and store the result on the analysis document

## Acceptance Criteria

1. After a game starting with `1. e4 c5` (Sicilian), `GET /analysis/:gameId` returns `ecoCode: 'B20'` and `ecoName: 'Sicilian Defence'`.
2. After a game starting with `1. d4 d5 2. c4` (Queen's Gambit), `GET /analysis/:gameId` returns `ecoCode: 'D06'` and `ecoName: 'Queen\'s Gambit'`.
3. For a game with no recognizable opening (e.g., `1. a3 a6`), `ecoCode` is `null` and `ecoName` is `null` — no error thrown.
4. The eco lookup adds < 5ms to total analysis time (confirmed by logging).

## Complexity

**Small** — Pure utility function with static JSON and a simple longest-prefix-match algorithm. The main task is populating `eco.json` with real ECO data.
