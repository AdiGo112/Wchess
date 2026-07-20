import { useNavigate } from "react-router-dom";

/* ============================================================================
 * TOURNAMENTS — PLACEHOLDER. Feature deferred by ADR-0032 (v1 = core game only).
 * This is the single biggest deferred subsystem (see docs/PROGRESS.md:
 * "no pairing algorithm — the big one"). Spec below so the scope is honest.
 * ============================================================================
 *
 * WHAT WILL BE BUILT HERE:
 *
 * ── Backend (service shell existed pre-cut; restore from a0ba2c6^, but the
 *    hard parts were never written) ──────────────────────────────────────────
 *  - Prisma models Tournament / TournamentPlayer were KEPT in schema.prisma
 *    at the scope cut, so the storage layer is ready.
 *  - Lifecycle (ADR-0017): UPCOMING → ONGOING → COMPLETED/CANCELLED.
 *    Transitions run on a scheduler — ADR-0016 said BullMQ cron, but Bull was
 *    deleted with the scope cut; re-decide then. Cheapest correct option now:
 *    a Redis-deadline sweep exactly like the game-clock sweeper from the
 *    ADR-0004 addendum — same pattern, same infra, zero new deps.
 *  - PAIRING — the actual work. Format per ADR-0015, Swiss is the default:
 *      · Swiss: rank by (score, tiebreak). Fold ranked list into score groups,
 *        pair top-half vs bottom-half within each group, float the odd player
 *        down. Constraints: never repeat a pairing (track played pairs in a
 *        set), alternate colors where possible, bye goes to the lowest-ranked
 *        player who hasn't had one (bye = 1 point). This is NOT full
 *        FIDE/Dutch pairing — that needs weighted matching; ship the greedy
 *        version first and note the variance in an ADR.
 *      · Tiebreak: Buchholz (sum of opponents' scores). One query, cached on
 *        TournamentPlayer.tiebreak after each round.
 *      · Arena (lichess-style, ADR-0015 alt): no rounds — finish a game,
 *        instantly re-pair with anyone free within ±rating-tolerance. Reuses
 *        the matchmaking queue machinery wholesale (queue key per tournament).
 *        Streak scoring: 2-in-a-row doubles points. Build AFTER Swiss works.
 *      · Round-robin / knockout: schema supports them; explicitly v3+.
 *  - Rounds: when all round-N games finish (or the round clock expires —
 *    unfinished games are adjudicated as draws, noted in an ADR), the sweeper
 *    fires pairing for round N+1 and creates game rooms via
 *    GamesService.createRoom, tagging Game.tournamentId (column exists).
 *  - Events over the existing socket: tournament_starting (T-5min),
 *    round_paired {roomId, opponent}, round_results, tournament_over.
 *  - Endpoints: POST /tournaments (create, auth), POST /:id/join (checks
 *    min/maxRating gates), DELETE /:id/join (withdraw; mid-tournament
 *    withdrawal = forfeit remaining rounds), GET /:id (full standings),
 *    GET /tournaments?status=.
 *
 * ── Frontend (all new) ─────────────────────────────────────────────────────
 *  - /tournaments: list, split UPCOMING (join button + entrants count +
 *    countdown chip) / ONGOING (spectate standings) / COMPLETED (final table).
 *  - /tournaments/:id — the hub, three states:
 *      · lobby: entrant list, rating gates, giant font-display countdown
 *      · live: standings table (rank / player / score / tiebreak) that
 *        re-sorts with a FLIP animation on round_results; "your next game"
 *        card that auto-navigates to /game/:roomId when round_paired lands
 *      · done: podium — top 3 as inverted cards (♛ #1 oversized), full table
 *        below, and each player's per-round history expandable.
 *  - Creation form: format, variant, time control, rounds, max players,
 *    optional rating window, start time. Card-b form, same input-b system.
 *
 * ── Why this was cut from v1 ───────────────────────────────────────────────
 *  Swiss pairing + round scheduling + adjudication is a genuine subsystem
 *  (lichess's arena implementation is a substantial codebase on its own).
 *  Zero of the pairing logic existed pre-cut — only CRUD. Shipping the core
 *  game 4+ weeks earlier won.
 *
 * ── Effort estimate ────────────────────────────────────────────────────────
 *  Swiss pairing + tests: ~3 days (test with synthetic 8/16/33-player fields;
 *  odd counts and repeat-avoidance are where greedy pairing breaks).
 *  Scheduler + round flow: ~2 days. Frontend: ~3 days. Arena: +3 days later.
 *  Total ≈ 8 dev-days for Swiss-only v2.
 * ========================================================================== */

export default function Tournaments() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <p className="tag-b-inverse mb-4">under construction</p>
      <h1 className="heading-b text-6xl md:text-7xl mb-4">
        THE ARENA<span className="animate-blink">_</span>
      </h1>
      <p className="max-w-md text-neutral-600 font-medium mb-2">
        Swiss tournaments with live standings, then lichess-style arenas.
        Biggest thing on the roadmap — worth doing right, not fast.
      </p>
      <p className="tag-b mb-8">not in v1. patience.</p>
      <button onClick={() => navigate("/lobby")} className="btn-b btn-b-primary">
        Warm up in the lobby →
      </button>
    </div>
  );
}
