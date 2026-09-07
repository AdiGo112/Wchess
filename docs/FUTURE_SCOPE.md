# WChess — Future Scope

> Where the platform goes next, in three tiers of certainty:
> - **Tier 1 — Committed.** Designed already (ADR + schema exist); only the code is pending.
> - **Tier 2 — Ambitious.** Credible extensions, mostly *enabled by decisions already made*.
> - **Tier 3 — Speculative.** Directional ideas; pursue only if a real need justifies them.
>
> Compiled 2026-07-24. Tier 1 items cite the ADR that specifies them; see `docs/features/`
> and `docs/PROGRESS.md`. A panel-ready summary sits at the bottom.

---

## Tier 1 — Committed (designed, code pending)

These have Architecture Decision Records and/or Prisma schema already; they are deferred work,
not new design.

### Complete the deferred feature modules
- ~~**Server-side engine analysis**~~ — **shipped 2026-09-07** (Stockfish Inc 2). Real depth-18
  Stockfish, but as a child process over UCI rather than a BullMQ job: Bull and MongoDB were both
  deleted by ADR-0032 before this was built, so ADR-0010 is superseded. Results live in the
  Postgres `GameAnalysis` table. `backend/src/analysis/`.
- **Post-game analysis board** — the *backend half is done*: move classification on clamped
  centipawn thresholds and per-player accuracy ship with the sweep above. Still open: the UI
  (eval bar, step-through board, accuracy panel), ECO opening naming, and brilliant-move
  detection, which needs a sacrifice heuristic nothing computes yet. *(ADR-0027, ADR-0028)*
- **Tournaments** — Swiss pairing (→ maximum-weight matching), Arena / Round-Robin / Knockout,
  Buchholz tiebreaks, BullMQ cron round-advancement. *(ADR-0015, ADR-0016, ADR-0017)*
- **Puzzles** — Lichess dataset import, SM-2 spaced repetition, Glicko-2 puzzle ratings, daily
  puzzle + streaks. *(ADR-0018, ADR-0019, ADR-0020)*
- **Chat** — pagination, typing indicators, rate limiting, profanity filter, and the **room-authz
  check that is currently missing** (must be fixed before chat returns). *(ADR-0013, ADR-0014)*
- **Notifications** — real-time socket delivery + email worker (SendGrid + BullMQ rate limit),
  bell/dropdown UI. *(ADR-0024, ADR-0025)*
- **Social graph** — friends, follows, Redis-TTL online presence, activity feed. *(ADR-0021,
  ADR-0022, ADR-0023)*
- **Spectate mode** — read-only live game viewing (previously removed; count logic was broken).

### Frontend / UX maturity *(feature 12)*
- Migrate state to **Zustand + React Query** (today: React Context + axios).
- Sound effects; **board themes + piece sets**; dark-mode polish; skeleton loaders / toasts.
- **Mobile layout + accessibility** — touch board, keyboard shortcuts.

### Stack / infrastructure catch-up
- Add **MongoDB** (chat, feed, notifications) and **BullMQ** (jobs) — designed for, not yet
  installed. Today the stack is a Postgres + Redis monolith. Analysis no longer needs either:
  it stores to Postgres and queues with a promise chain, which is the right shape until there
  is a second instance to distribute across (ADR-0032).

---

## Tier 2 — Ambitious (credible next horizon)

Most of these are *cheaper than they look* because a prior decision already enables them.

### Scale & architecture *(ADR-0032)*
- **Split the socket layer** out of the monolith first (mirrors Lichess `lila` / `lila-ws`),
  triggered at the written threshold: >5k concurrent sockets, or deploys interrupting live games.
- Full **microservices** decomposition only when traffic demands it (service map in `overview.md`).
- **Multi-instance horizontal scaling** via the Redis Socket.io adapter; presence is already
  designed stateless for this.

### AI & personalization
- **Personalized coach** — an explanation layer over analysis data that says *why* a move failed
  in plain language, not just centipawns. *(enabled by: the analysis pipeline above)*
- **Adaptive puzzle curriculum** — cluster a user's mistakes by theme (pins, back-rank, endgames)
  and auto-generate a training track. *(enabled by: SM-2 state + attempt log)*
- **Human-like bots** — Maia-style engines that play at a target rating with *human* errors, not
  Stockfish's alien skill-throttling.
- **Style fingerprinting** — profile opening/tactical tendencies from game history.

### Variants & game modes
- **Chess variants** — Chess960, Crazyhouse, Atomic, King-of-the-Hill (needs a variant rules
  engine; chess.js is standard-only — real engineering scope).
- **Bughouse / team play** — 2v2 real-time; genuinely new load on the socket + room model.
- **Correspondence chess** — multi-day games with persistent clocks (no in-memory room assumption).

### Broadcast & community
- **Live spectating at scale** — thousands on one board via fan-out (not per-viewer sockets), with
  a delay buffer for anti-cheat.
- **Tournament broadcast** — commentary, multi-board views, live arena leaderboards.
- **Creator tools** — OBS overlays, shareable game GIFs/clips, embeddable boards.
- **Clubs & teams** — group identity, team leagues, private tournaments.

### Integrity & anti-cheat *(natural given server-authority)*
- **Engine-correlation detection** — statistical fair-play analysis of move quality vs rating.
- **Behavioral signals** — timing patterns, tab-focus, input telemetry.
- **Titled-player verification** and a trust / reputation system.

### Platform & reach
- **Native mobile apps** (React Native, reusing the TypeScript socket/REST contracts) with offline
  puzzle solving. *(enabled by: the shared `types.ts` contracts)*
- **Public / federated API** — let third parties build bots and tools (Lichess board API model).
- **Accessibility-first mode** — full screen-reader board, voice move input, colorblind-safe themes.
- **Internationalization** — multi-language UI and opening names.

### Data & research *(leans into the "tractable open reference" positioning)*
- **Opening explorer** built from the platform's own game corpus.
- **Public anonymized datasets** + a research API.
- **Rating-system lab** — A/B test Glicko-2 variants on live data; the confidence-based core makes
  this tractable.
- **FSRS** as an eventual successor to SM-2 once per-user calibration data exists.

---

## Tier 3 — Speculative (only if a real need appears)

- **VR / 3D immersive board** — low priority; novelty over need.
- **On-chain tournament prizes / verifiable results** — only if a concrete trust problem justifies
  it; otherwise YAGNI.
- **AI-generated commentary / voice narration** of live games.
- **Cross-platform account federation** (import ratings/games from Lichess/Chess.com).

---

## Panel summary (two lines)

1. The near-term roadmap is **already designed** — every Tier 1 item has an ADR; the work is
   implementation, not open questions.
2. The larger vision is **unlocked by decisions already made** — server-authority makes anti-cheat
   natural, the shared TS contracts make native apps cheap, and the Glicko-2 core makes a rating
   lab tractable. The items with real research/engineering depth are the **variant engine**,
   **human-like bots**, and **engine-correlation anti-cheat**.

*Related: `docs/ALGORITHMS.md` (Tier B lists the planned algorithms behind Tier 1 here),
`docs/architecture/ADR-0032` (the monolith→split trigger), `docs/PROGRESS.md` (current state).*
