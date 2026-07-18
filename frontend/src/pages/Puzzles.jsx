import React from "react";
import { useNavigate } from "react-router-dom";

/* ============================================================================
 * PUZZLES — PLACEHOLDER. Feature deferred by ADR-0032 (v1 = core game only).
 * ============================================================================
 *
 * WHAT WILL BE BUILT HERE (full spec, so future-us doesn't have to re-derive it):
 *
 * ── Backend (mostly exists already; restore from commit a0ba2c6^) ──────────
 *  - The `puzzles` Nest module was deleted in the v1 scope cut but the Prisma
 *    models (`Puzzle`, `PuzzleAttempt`) were deliberately KEPT in schema.prisma,
 *    so no migration is needed to bring this back.
 *  - Data source: the lichess open puzzle database (ADR-0018) — a CSV of ~4M
 *    puzzles with FEN, solution moves (UCI), rating, RD, popularity, themes,
 *    opening ECO. Import script filters to popularity > 80 and takes a rating-
 *    stratified sample (~100k rows) so every skill band has depth.
 *  - Rating: puzzles are rated with Glicko-2 exactly like players (ADR-0020).
 *    A user's PUZZLE variant rating lives in the existing UserRating table
 *    (TimeVariant.PUZZLE is already in the enum). Solving = a "win" against
 *    the puzzle's rating; failing = a "loss". Puzzle ratings drift too —
 *    that's why Puzzle carries its own rating + ratingDeviation columns.
 *  - Selection endpoint: GET /puzzles/next → picks a puzzle within ±100 of the
 *    user's puzzle rating, excluding puzzles attempted in the last 30 days
 *    (query PuzzleAttempt), preferring themes the user fails most.
 *  - Spaced repetition (ADR-0019): failed puzzles re-queue on an SM-2 schedule
 *    (1d → 3d → 7d → 21d), stored as nextReviewAt on PuzzleAttempt.
 *  - POST /puzzles/:id/attempt { movesPlayed, timeMs } → server re-validates
 *    the solution line move by move with chess.js (client is never trusted),
 *    updates both Glicko-2 ratings transactionally, returns rating deltas.
 *
 * ── Frontend (all new) ─────────────────────────────────────────────────────
 *  - Board reuses the strict-mono Chessboard setup from ChessGame.jsx
 *    (same LIGHT_SQ/DARK_SQ constants — extract them to a shared module then).
 *  - Flow: position appears oriented for the side to move → user plays a move
 *    → if it matches the solution line, the opponent's reply auto-plays after
 *    300ms and it's your move again → wrong move = board shakes (CSS keyframe,
 *    translateX ±6px), the wrong move snaps back, one retry allowed, second
 *    miss = fail, solution plays out with move-by-move stepping.
 *  - HUD: current puzzle rating chip, your puzzle rating with live delta
 *    (▲ +7 flashes inverted on solve), streak counter (font-display, huge —
 *    streaks are the retention hook), themes revealed only AFTER solving
 *    (knowing "it's a fork" beforehand is a spoiler).
 *  - Daily mode: one shared puzzle per calendar day (seeded by date), everyone
 *    gets the same one, shareable result à la Wordle: "ChessWeb Daily #217 ✓
 *    in 0:43" as copy-to-clipboard text. This is the growth loop.
 *  - Keyboard: arrows step through the post-solve replay; N = next puzzle.
 *
 * ── Effort estimate ────────────────────────────────────────────────────────
 *  Backend restore + import script: ~1 day. Rating/SRS endpoints: ~1 day.
 *  Frontend board flow + daily mode: ~2 days. Total ≈ 4 dev-days.
 * ========================================================================== */

export default function Puzzles() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <p className="tag-b-inverse mb-4">under construction</p>
      <h1 className="heading-b text-6xl md:text-7xl mb-4">
        PUZZLES<span className="animate-blink">_</span>
      </h1>
      <p className="max-w-md text-neutral-600 font-medium mb-2">
        Rated tactics from the lichess database, spaced repetition on your
        misses, and a shareable daily puzzle.
      </p>
      <p className="tag-b mb-8">not in v1. soon.</p>
      <button onClick={() => navigate("/lobby")} className="btn-b btn-b-primary">
        Play a real game instead →
      </button>
    </div>
  );
}
