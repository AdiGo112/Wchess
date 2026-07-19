# ADR-0018 — Use Lichess Open Puzzle Dataset as Puzzle Source

## Status

Accepted

## Context

ChessWeb needs a large, high-quality corpus of chess puzzles to deliver a meaningful tactical training experience. Building puzzles from scratch is not viable for a launch product — puzzle creation requires chess expertise, editorial review, and significant manual work. The alternatives considered were:

1. **Build our own puzzles** — requires expert human effort; not scalable to the millions of positions needed at launch
2. **License commercial puzzle sets** (e.g., Chess.com, ChessKid, Chessable) — requires per-user licensing fees, restricts redistribution, creates legal and commercial complexity
3. **Use the Lichess open puzzle dataset** (CC0 public domain) — ~3.3M puzzles, Glicko-2 pre-rated, tagged with tactical themes, available for free download

The Lichess dataset is the industry standard for open-source chess applications. It is derived from real Lichess games, where each puzzle is a real position with a verified correct continuation. The dataset is updated regularly and has been validated by millions of Lichess users.

**Key dataset facts at decision time:**
- Size: ~3.3 million puzzles (CSV, ~900 MB compressed)
- License: CC0 (public domain — no attribution required, full commercial use permitted)
- Format: comma-separated CSV with columns: `PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags`
- Rating range: approximately 600–3000, distributed around 1500
- Download URL: `https://database.lichess.org/#puzzles`
- Update cadence: Lichess releases updated exports periodically

**FEN and moves semantics:**
The FEN represents the board state immediately before the puzzle begins. The `Moves` field is a space-separated list of UCI move strings. The first move is the opponent's "challenge" move (played automatically by the frontend after a short delay); subsequent moves alternate between the user's expected response and the opponent's continuation. This one-move-ahead convention means the user always sees a position that needs an immediate tactical response.

## Decision

Use the Lichess open puzzle dataset as the sole puzzle source at launch. The import is performed by a Node.js seeder script (`src/puzzles/seeds/seed-puzzles.ts`) that:
1. Streams the CSV file using `csv-parse` to avoid loading 900 MB into memory
2. Maps each CSV row to the `Puzzle` Prisma model fields
3. Batch-inserts 1,000 rows at a time using `prisma.puzzle.createMany({ skipDuplicates: true })`
4. Preserves the Lichess `PuzzleId` as the primary key so re-imports are idempotent

The Lichess Glicko-2 rating and RD are imported as starting values. After import, ChessWeb users' attempts update the puzzle's rating independently of the Lichess dataset — the two diverge over time as ChessWeb's user population solves puzzles.

The `openingTags` field (e.g., `sicilianDefense`) is stored separately from tactical `themes` (e.g., `fork`, `pin`) to allow independent filtering.

The seeder is triggered manually by running:
```
npx ts-node src/puzzles/seeds/seed-puzzles.ts data/lichess_db_puzzle.csv
```

Expected runtime is approximately 10 minutes for the full 3.3M-puzzle dataset on standard developer hardware.

## Consequences

**Positive:**
- Zero cost — CC0 license permits unrestricted commercial use with no attribution requirement
- 3.3M puzzles at launch — far more than a typical user will exhaust; the 404 "no puzzles available" path is effectively unreachable
- Pre-rated with Glicko-2 — puzzle ratings are already calibrated; ChessWeb only needs to refine them over time
- Themed and tagged — `themes[]` and `openingTags[]` fields enable filtered browsing without any additional classification work
- Re-import is safe — `skipDuplicates: true` means running the seeder again after a new Lichess export only inserts newly added puzzles
- Real game positions — puzzles come from actual Lichess games, making them pedagogically sound

**Negative / Trade-offs:**
- One-time large import (~10 min) is required before the app can serve puzzles; production deployments need a seeded database
- Puzzle quality is Lichess-defined: a small fraction of puzzles may have disputed solutions that ChessWeb has no editorial control over
- The dataset does not include puzzle explanations or solution annotations; ChessWeb cannot show "why" a move is correct without building that separately
- FEN convention (opponent moves first) requires the frontend to apply the first move automatically before the user can interact, adding a small UX implementation detail

**Out of scope for this decision:**
- Whether to add ChessWeb-curated puzzles in the future (handled as a separate feature)
- How the seeder handles partial failures mid-import (currently: re-run from scratch using `skipDuplicates`)
- Puzzle difficulty calibration beyond using the Lichess-provided Glicko-2 rating
