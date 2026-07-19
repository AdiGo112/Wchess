# ADR-0028: Bundle ECO Opening Database as a Static JSON File

**Status:** Accepted
**Date:** 2026-06-24

## Context

Post-game analysis should identify the opening played in each game using the Encyclopaedia of Chess Openings (ECO) code system — a standard reference where every opening is assigned a code (A00–E99) and a name (e.g., "B20 — Sicilian Defence").

Options for ECO identification:

**Option A: External API**: Call a third-party API (e.g., Chess.com's opening API or Lichess's opening explorer API) during analysis to identify the opening from the move sequence. Pros: always up-to-date. Cons: adds latency to every analysis job, introduces an external dependency that could fail or be rate-limited, requires internet access from the backend analysis worker.

**Option B: PostgreSQL lookup table**: Store ECO codes in a PostgreSQL table with a `moves_prefix` column and query it during analysis. Pros: transactional consistency with other game data. Cons: adds a synchronous DB query to an already CPU-bound Stockfish analysis job, requires a migration to populate the table.

**Option C: Static JSON bundled with the backend**: Download the ECO database once as a JSON file (keys = UCI move sequences, values = { code, name, family }) and include it in the backend source tree at `backend/data/eco.json`. Load it once into memory on startup. Pros: zero latency, no external dependency, simple to use, works offline. Cons: ~300KB file adds to the repo size, updates require a redeploy.

The ECO database is stable — it has not seen a major update in years. The ~300KB file size is negligible. The zero-latency benefit is significant since ECO lookup happens per-game (not per-move) and blocking on a DB query during Stockfish processing would serialize operations unnecessarily.

## Decision

Bundle the ECO opening database as a static JSON file at `backend/data/eco.json`. The `EcoLookup.identify(uciMoves: string[])` function loads this file once on first call and caches it in memory. It finds the longest matching prefix of the game's UCI move sequence against the JSON keys and returns the corresponding ECO entry.

The JSON structure uses space-joined UCI moves as keys:
```json
{
  "e2e4 c7c5": { "code": "B20", "name": "Sicilian Defence", "family": "Sicilian" },
  "e2e4 c7c5 g1f3": { "code": "B40", "name": "Sicilian Defence, French Variation", "family": "Sicilian" }
}
```

The lookup algorithm tries progressively shorter prefixes until a match is found, so games that go beyond the database's known opening lines still return the deepest matching ECO entry.

## Consequences

**Positive:**
- Zero latency — ECO identification adds < 1ms to analysis job completion time after the first load.
- No external dependency or network call during analysis processing.
- Simple code — `eco-lookup.ts` is a pure function that reads a JSON file.
- Fully testable offline.

**Negative:**
- The `eco.json` file (~300KB when fully populated with all ECO lines) is committed to the git repository, slightly increasing repository size. This is acceptable.
- Updates to ECO codes (rare, but possible if new opening theory is codified) require updating `eco.json` and redeploying. There is no automated refresh mechanism.
- A game with a very novel or exotic opening might not match any ECO entry, resulting in a null `ecoCode`. This is handled gracefully — the analysis result simply omits the ECO fields.

**Neutral:**
- The initial `eco.json` shipped in v1 contains approximately 20 common openings. A future task can replace it with the full ECO dataset (several hundred entries) without any code changes.
