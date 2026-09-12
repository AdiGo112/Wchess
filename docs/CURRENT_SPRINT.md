# ChessWeb — Current Sprint

> This file is the single source of truth for what's happening right now.
> Update it at the start and end of every coding session.

---

## Active Branch
`chore/ci-pipeline` — cut from `dev` on 2026-09-12. First CI pipeline, plus the
system-design and infrastructure docs it made obvious were lying. See
**Currently In Progress** below.

## Previous Branch
`feature/board-layout` — cut from `dev` on 2026-09-08 to rebuild the board pages
around a full-height board. Merged (`468460f`, then `2aa8f99` easing the board off
the hard left edge).

## Earlier
`dev`. Three feature branches merged in on 2026-09-08:

| Merge | Branch | What |
|---|---|---|
| `8e70b4e` | `feature/stockfish-inc2` | Stockfish Inc 2 — server-side post-game analysis |
| `0cc913c` | `feature/analysis-ui` | Analysis Inc 4 + 5 — the game review page |
| `480be75` | `feature/eco-openings` | Analysis Inc 3 — ECO opening naming |

**Nothing is pushed.** `origin/dev` is still at the pre-Increment-2 hardening merge,
and `staging` and `main` are further behind. Next feature branch should be cut from
`dev`.

`dev` — `feature/stockfish-inc2` merged in as `8e70b4e` (2026-09-07): Stockfish
Increment 2, server-side post-game analysis. Not pushed yet.

## Previous Branch
`dev` — `feature/v1-scope-cut` merged in as `31b6e87` (2026-07-19) and pushed. The merge
carried `d3bfa1a` (stockfish WASM) too, since the feature branch was cut from it.
Verified pre-push: backend `tsc` clean, frontend build clean, and the full stack was
driven live earlier (12-page Playwright walk-through incl. a computer game, 0 console
errors). Next feature branch should be cut from `dev`.

Also on dev now: `62593c5` monochrome neo-brutalist UI redesign, `2cb3a8d` brand rename
ChessWeb → WChess (user-facing strings only; note the GitHub remote was already named
`Wchess`).

## Done on `dev`
- `62593c5` — **Full UI redesign: monochrome neo-brutalism.** Black/white/greys only,
  3px borders, hard offset shadows, Archivo Black + Space Grotesk + Space Mono
  (Google Fonts in `index.html`). Design tokens in `tailwind.config.js`, reusable
  classes (`btn-b*`, `card-b*`, `input-b`, `tag-b`) in `index.css`. Strict-mono board:
  grey squares, inversion/ring highlights, blinking inverted clock under 30s.
  DifficultySlider became a 5-step segmented control (same props contract).
  New `/puzzles` + `/tournaments` placeholder pages carrying full build specs in
  comments (data sources, pairing algorithm sketch, endpoints, effort estimates) —
  read those before starting either feature. Deleted 4 empty component files.
  Zero logic changes. Vite build clean; **browser click-through still pending.**
- `a0ba2c6` — **v1 scope cut per ADR-0032.** Deleted chat, notifications, puzzles,
  tournaments, stockfish modules; the `spectate` handler and `ActiveRoom.spectatorCount`;
  MongoDB (compose + deps + env) and Bull. 615 deletions, 1 insertion. Verified:
  `npm install`, `tsc --noEmit`, `nest build` all clean; `docker compose config` resolves
  to postgres + redis only. **Not** verified by booting — Docker daemon was down.
  Prisma models for Puzzle/Tournament left in place on purpose (dropping them is a
  destructive migration for no runtime gain; both are planned increments).

## Last Completed
- **Stockfish — computer games now actually play (Increments 3 + 4 done; Increment 1 superseded)**
  - **Resolved a live doc contradiction:** ADR-0009 says computer moves run as Stockfish WASM
    in the browser; `IMPLEMENTATION_PLAN_INCREMENT_1` said they run as a server-side BullMQ job.
    The code had half-built the *server* path — the gateway enqueued a `computer-move` job and the
    processor computed a heuristic move and then **only logged it**, so vs-computer games hung
    after White's first move. **ADR-0009 wins; the server-side computer-move path is deleted.**
  - Deleted: `StockfishProcessor.handleComputerMove` + its heuristic, `StockfishService.queueMove`,
    `GameGateway.emitComputerMove` (dead — nothing ever called it), the `StockfishModule` import
    in `GamesModule`. The processor is now analysis-only.
  - New frontend: `hooks/useStockfish.js` (Web Worker + UCI), `scripts/copy-engine.mjs`
    (copies engine from node_modules → `public/engine/` on predev/prebuild; gitignored).
    `ChessGame.jsx` detects `black.id === 'computer'`, thinks on black's turn, shows
    "Stockfish is thinking…", emits the move.
  - New backend: **`computer_move`** socket event. Needed because `handleMove` rejects moves from
    a socket that doesn't own the turn, and black is `{id:'computer'}`. Guards: room is vs-computer,
    sender is that room's white player, black to move, chess.js legality. Computer games are unrated,
    so a tampered client gains nothing. `game_start`/`game_state` now carry `difficulty`.
  - **Engine build:** `stockfish-18-lite-single` (7.3MB). The full net is **113MB** and the threaded
    builds need SharedArrayBuffer → COOP/COEP headers app-wide. ADR-0009's "~3.5MB" was optimistic;
    ADR amended.
  - **Verified on the live stack — ALL PASS:** UCI check drove the real engine at all 5 difficulty
    levels (every one returned a legal move; skill visibly changes the choice). E2E: 13/13 — three
    full human/engine move pairs (e5, d5, Bd6), black's clock ticks down, `difficulty` arrives in
    `game_start`, and all three guards hold (refuses on white's turn / refuses illegal move /
    refuses a non-player socket), with a legit move still accepted afterwards. Vite serves the
    worker + wasm (HTTP 200). Backend `tsc` + frontend build clean.
  - Not done: browser click-through (no Playwright here) — the React path is verified by build +
    the socket contract, not by a real DOM.

## Previously Completed
- **Matchmaking code-review fixes — remaining 7 of 10** (all 10 now resolved)
  - #4 pair resilience: `pairAndNotify` re-queues both players if `createRoom` throws (build+logic verified)
  - #5 `user:socket` persistent (no TTL) in `game.gateway` so `notifyUser` survives long sessions — verified TTL=-1, still deleted on disconnect
  - #6 `timeControl` threaded through `match_found`/`challenge_accepted`/accept-response → navigation state → no 5:00 clock flash (verified payloads carry timeControl)
  - #7 `createChallenge` derives `variant` from `timeControl` (verified stored variant ignores bogus dto value)
  - #8 `createRoom` gains optional `difficulty`; `createComputerRoom` is now a single Redis write (difficulty still verified in Redis)
  - #9 `ALREADY_IN_QUEUE` enforced via `isQueued` (verified second same-queue join errors, no duplicate entry)
  - #10 `createChallenge` prunes the creator's accepted/expired challenges (verified expired row pruned)
  - All three verify suites (new fixes / regression / prior fixes) ALL PASS; backend+frontend builds clean.

- **Matchmaking code-review fixes — top 3 of 10** (highest-severity, matchmaking-contained)
  - **#1 double-accept race**: `acceptChallenge` now claims the challenge atomically (`updateMany where status='pending'`); loser gets 409; `createRoom` wrapped in try/catch that reverts the claim on failure. Verified: two parallel accepts → exactly one 201 + one 409, single game.
  - **#2 multi-queue leak**: new `MatchmakingService.leaveAllQueues(userId)` called in `enqueue` (DOMAIN rule 1 — joining any queue leaves all others) and in gateway `handleDisconnect` (sweeps all queues). Removed now-dead `client.data.queue*` tracking. Verified: 2nd join leaves the 1st; disconnect sweeps all.
  - **#3 reconnect strands searcher**: `useMatchmakingSocket` stores the desired queue and re-emits `join_queue` on socket `connect` (reconnect). Build + logic verified (frontend-only; not headless-testable).
  - Regression suite + fix suite both ALL PASS; backend `tsc`/build + frontend build clean.
  - **Deferred (7 of 10):** #4 pair-throw re-queue, #5 user:socket TTL (game-engine), #6 ChessGame clock default (game-engine), #7 challenge variant derive, #8 createComputerRoom double-write (game-engine), #9 ALREADY_IN_QUEUE, #10 challenge prune.

- **Matchmaking full-feature audit + verification** (Inc 1/2/3)
  - Doc-vs-code review: found & closed one gap — `queue_position` (server→client every 5s) was in API_DESIGN/WORKFLOWS/DELIVERY but unimplemented. Added `MatchmakingService.broadcastPositions()` (5s interval, `estimatedWait = position*15`), wired the frontend hook + Lobby "Position: N in queue".
  - Dead code removed: `frontend/src/components/GameControls.jsx` (orphaned by Lobby).
  - Full runtime verification (live stack) — ALL PASS: quick match (shared room/opposite colors/opponent), `queue_position {1, 15}`, disconnect cleanup, friend challenge + **`challenge_accepted` socket to creator** (previously untested), re-accept 409 / self 403 / unknown 404 / no-auth 401 / forced-expiry 404, computer game (difficulty 4 + black=computer in Redis). React DOM itself validated via production build only (no Playwright installed).

- **Matchmaking Increment 3** — Frontend lobby (build passes)
  - New: `pages/Lobby.jsx` (Quick Match / Play a Friend / Play Computer cards), `hooks/useMatchmakingSocket.js` (reuses shared `useSocket()` default-namespace connection; `match_found` + `challenge_accepted` → `/game/:roomId`; join/leave queue + local search timer), `components/VariantSelector.jsx` (+ `TIME_PRESETS`), `components/DifficultySlider.jsx`, `pages/ChallengeAccept.jsx` (`/challenge/:token` → POST accept → game)
  - Adapted from the `.tsx` docs to the real JSX stack; navigates on `roomId` (not the doc's `gameId`); challenge `variant` sent from preset to satisfy backend `IsIn` enum
  - `App.jsx`: `/lobby` + `/challenge/:token` protected routes. `Game.jsx`: removed dead `join_queue`/`create_room` blocks → redirects to `/lobby` if no room (fixes the computer-mode no-op). `Home.jsx` "New Game" → `/lobby`. `Navbar.jsx`: added "Play" link.
  - `components/GameControls.jsx` now orphaned (superseded by Lobby) — left in place, not deleted.

- **Matchmaking Increment 2** — Backend REST: friend challenges + computer games (runtime-verified)
  - Prisma: `Challenge` model + `User.challenges` relation; migration `20260628115856_add_challenge`
  - New files: `matchmaking.controller.ts`, `dto/create-challenge.dto.ts`, `dto/create-computer-game.dto.ts`
  - `matchmaking.service.ts`: `createChallenge` (16-byte token, 10-min TTL, shareUrl), `acceptChallenge` (color resolution, FK-backed, marks accepted+gameId, `challenge_accepted` socket notify to creator via `user:socket:` Redis map), `createComputerGame`, `getQueueStatus`, `notifyUser`, `buildPlayer`
  - `games.service.ts`: `createComputerRoom` + `difficulty?` on `ActiveRoom` (black = `{id:'computer'}` per game-engine convention, NOT null as the idealized doc said)
  - **Verified** (2 registered users, live stack): create/accept (creator-white → accepter-black), re-accept 409, self-accept 403, unknown 404, computer game (difficulty 3 in Redis, black=computer), queue-status, 401 no-auth, forced-expiry → 404 `CHALLENGE_EXPIRED`. All pass.

- **Matchmaking Increment 1 (rebuild)** — Backend queue, clean rebuild
  - New files: `matchmaking/types/queue-entry.interface.ts`, `matchmaking/dto/join-queue.dto.ts`
  - `matchmaking.service.ts` rewritten: service-owned 500ms polling loop (`OnModuleInit`/`OnModuleDestroy`), Redis List queues keyed `queue:{variant}:{timeControl}`, per-user dedupe on enqueue, ADR-0008 tolerance `min(50 + waitSeconds*12, 400)`, longest-wait-first pairing, atomic LREM claim with put-back on partner-vanish, random color assignment, `match_found` emit
  - `matchmaking.gateway.ts` rewritten: `join_queue`/`leave_queue` with `JoinQueueDto` + `ValidationPipe`, `OnGatewayDisconnect` removes player from their queue, rating fetched per-variant from `userRating`; **`create_room` socket handler removed** (it was Inc 2 scope + had the broken dynamic import — returns as a REST controller in Inc 2)
  - Type-check passes (`tsc --noEmit`)

- **Game Engine Increment 3** — Frontend board improvements
  - `ChessGame.jsx` rewritten: `isDraggablePiece` color lock (own pieces only), draw UI split (offerer pending/cancel vs receiver accept/decline), result emoji + "(You)" indicator in rating modal, rematch flow (`rematch_offered` / `rematch_ready` events + navigate)
  - `game.gateway.ts`: `rematch_request` handler — first request emits `rematch_offered`, second emits `rematch_ready` with new roomId (swapped colors)
  - `games.service.ts`: `rematchRequestedBy: string | null` field in `ActiveRoom` interface + `createRoom()` initializer

- **Game Engine Increment 2** — Backend draw + disconnect
  - Auto-resign timer (60s Map-based setTimeout), reconnect state sync (`game_state` emit), draw accept validation (can't accept own offer), `logoutByRefreshToken` already wired, Redis `user:socket` leak fixed

- **Auth Increment 4** — ProtectedRoute, logout with redirect, manual-redirect cleanup
  - Created: `frontend/src/components/ProtectedRoute.jsx` — `isLoading` spinner + `<Navigate>` if not authed
  - Modified: `App.jsx` — `/game`, `/game/:roomId`, `/profile`, `/history` wrapped in `<ProtectedRoute />`
  - Modified: `Navbar.jsx` — logout now `await logout()` + `navigate('/login')` on both desktop and mobile
  - Modified: `Game.jsx`, `GameHistory.jsx`, `Profile.jsx` — removed manual redirects (ProtectedRoute owns it)
  - Public routes kept: `/`, `/login`, `/signup`, `/leaderboard`, `/players`

- **Auth code-review fixes** — 14 findings from /code-review max resolved:
  - Backend: $transaction on refresh rotation, P2025 catch, isBanned before delete,
    P2002 catch in register, logoutByRefreshToken(), JwtAuthGuard removed from logout,
    JWT_SECRET fail-fast on startup
  - Frontend: bootedRef StrictMode guard, isLoading stuck fix, logout sends refresh token,
    socket auth as function, skipRetry exact match + /auth/logout added, Profile name crash fix

- **Auth Increment 3** — Frontend auth: token in memory, interceptors, Login/Signup fix
  - Rewrote `frontend/src/api.js` — setupInterceptors queue pattern for concurrent 401s
  - Rewrote `frontend/src/context/AuthContext.jsx` — accessToken in useRef, refreshToken in sessionStorage, silent restore on mount
  - Updated `frontend/src/context/SocketContext.jsx` — uses `getToken()` instead of localStorage
  - Updated `frontend/src/pages/Login.jsx` — calls `login(username, password)`, proper 401 error, `from` redirect
  - Updated `frontend/src/pages/Signup.jsx` — confirmPassword field, field-level 409 codes, toast + redirect to /login
  - Updated `frontend/src/components/Navbar.jsx` — `player` → `user` (removed old alias)
  - Added `<Toaster>` to `frontend/src/App.jsx`; installed `react-hot-toast`
  - Build passes: 1777 modules, no errors

## Currently In Progress
`chore/ci-pipeline` — **the repo gets a pipeline, and the docs stop lying.**

There was no `.github/` at all. Twenty-two branches, a documented promotion order,
and nothing checking either. Now:

- `.github/workflows/ci.yml` — three jobs. **backend**: `npm ci` → `prisma generate`
  → `npm test` (20 unit tests) → `npm run build` (`nest build` *is* the typecheck, so
  a separate `tsc --noEmit` would be the same work twice). **frontend**: `npm ci` →
  `npm run build` (prebuild copies the engine, then `tsc --noEmit && vite build`).
  **promotion**: rejects a PR that skips a step — `main` takes only `staging` or
  `hotfix/*`, `staging` takes only `dev`, `dev` takes anything. Branch names arrive
  through `env:`, never interpolated into the shell, because a fork can name a branch
  anything.
- No Postgres or Redis service containers: both suites are pure units. `DATABASE_URL`
  is a job env var only because Prisma must *resolve* it to parse the schema.
- No lint job. `backend` has no ESLint config at all, and `frontend/eslint.config.js`
  matches `**/*.{js,jsx}` — every source file has been `.ts`/`.tsx` since the TS
  migration, so it lints zero files. A green job over nothing is worse than no job.
- No deploy job. `staging` and `main` are branches, not servers.
- `.github/pull_request_template.md` — the verification and docs checklist this
  project has been running from memory.

- `.github/setup-branch-protection.sh` — a 5-stage wizard that applies the branch
  protection the pipeline needs to be binding instead of advisory. Applies it via
  `gh api` when the CLI is authenticated, offers `gh auth login`, and walks the web
  UI when it is not. The three required check names are read out of `ci.yml` rather
  than retyped, with a test asserting they match byte-for-byte — a check name off by
  one character never reports, and the branch then blocks forever with no useful
  error. Defaults suit a one-person project and are both asked about rather than
  assumed: 0 required approvals (a PR is still mandatory, but a solo dev who must
  approve their own PR can never merge) and admins not enforced (a broken pipeline
  should not lock you out of your own `main`).

**Docs, which the pipeline made obvious were stale:**

- `docs/architecture/overview.md` — rewritten. It still advertised MongoDB, BullMQ,
  Zustand, React Query and five modules deleted by ADR-0032, and a 15-microservice
  map that was never built. Now: the invariant, the real stack, the deployable shape,
  the seven modules, store ownership, the four load-bearing mechanisms (CAS, the
  deadline sweeper, the rating `$transaction`, Glicko-2), and the split trigger.
  It indexes `Diagrams.md` rather than redrawing it.
- `Diagrams.md` §15 — the keyspace map was missing `clock:deadlines`, the ZSET the
  whole clock design rests on. Added.
- `docs/infrastructure/ci-cd.md` — new. The pipeline, what is deliberately left out
  and why, the branch workflow, the hotfix exception, and the branch-protection
  settings that make the promotion job binding instead of advisory.
- `docs/infrastructure/environment.md` — listed `MONGODB_URI` and `SENDGRID_API_KEY`
  as **required**, plus `BULL_CONCURRENCY_*` and `STOCKFISH_BINARY_PATH`. None of
  them are read anywhere. Rewritten against the actual `process.env` reads; adds
  `FRONTEND_URL` and `VITE_PROXY_TARGET`, which were real and undocumented.
- `docs/infrastructure/docker-setup.md` — inlined a stale copy of
  `docker-compose.yml` (with a MongoDB service), wrong container names, and a seed
  script that does not exist. Now points at the real compose file.
- `docs/infrastructure/deployment.md` — sketched a CI YAML that did not exist; now
  points at the one that does.
- `docs/README.md` — said feature branches are cut from `main`. They have not been
  since `dev` became the integration branch.

**Verified:** `npm test` 20/20 and `nest build` clean on backend; `npm run build`
clean on frontend — the exact commands CI runs, run locally first. The workflow YAML
parses (js-yaml) and declares all three jobs. The promotion guard was extracted from
the YAML and executed against all eight head/base pairs: 8/8 correct.

**Not verified:** the pipeline has never run on GitHub. Nothing is pushed yet, and
branch protection is a repo setting, not a file — until it is on, a red promotion
check is advisory.

## Previously In Progress
`feature/board-layout` — **the board pages fill the screen and stop scrolling.**

Asked for directly: the board was too small, the page scrolled, and the panels
sat under and beside it. Now the board is as large as the frame allows, pinned
left, with everything else in one column to its right — on the play page and the
review page alike. On a 1080p screen the board went from a hard 500px cap to
~900px.

- `hooks/useBoardFit.ts` — one shared hook. A `ResizeObserver` on the row holding
  the board and its panel; the board is the smaller of the row height and the
  width left over after the panel, so it follows window resizes with no magic
  offsets for the navbar or page padding. It reserves 14px for the 8px hard
  offset shadow, which the frame edge was otherwise clipping — the one place
  this design system shows depth.
- **It uses a callback ref, not `useRef`.** The review page returns a loading
  state first, so at effect time a plain ref was still null: the observer never
  attached and the board sat at its 260px floor while the play page looked fine.
  Fixed in the hook, so any future page with an early return is safe too.
- `App.tsx` — the window itself no longer scrolls; `<main>` is the scroll
  container. A page that fits the viewport scrolls nowhere at all, and every
  other page scrolls inside the frame instead of moving it.
- Long move lists scroll inside their own card, so the page never grows.
- Below 1024px the board and panel stack and normal scrolling returns — a fixed
  full-height layout on a phone is worse than a scrolling one.

**Status: DONE, 22/22 in a real browser.** Three checks added to
`verify-review-ui.mjs` guard the intent directly: the board is more than 60% of
the viewport height, its left edge is in the left quarter, and neither the page
nor `<main>` scrolls. Measured at 1920x1080 and 1366x768: board 904/592px on
play, 883/571px on review, nothing scrolling at either size. 16/16 page walk
still green.

## Previously In Progress
`feature/eco-openings` — **Analysis increment 3: ECO opening naming.** The last
open piece of the analysis feature.

`Game.openingEco` and `Game.openingName` have been columns with nothing writing
them since the initial schema — the third instance of that shape in this repo,
after `Game.pgn` and the `@@index` duplicates the hardening pass removed.

- `backend/src/games/openings.ts` — longest-prefix match of the SAN move list
  against a static table, filled in `saveCompletedGame` (the only place a finished
  game is written, so the only place it can be filled) and emitted as standard
  `[ECO]` / `[Opening]` PGN tags, so an exported game names itself in any viewer.
- **Main lines only, on purpose.** The full ECO list is ~3000 transpositions this
  codebase has no other use for, and every extra entry only refines a label. Because
  the match falls back to the nearest shorter prefix, an unlisted line still reads
  "Sicilian Defence" rather than nothing: a shallow table degrades to vaguer, never
  to wrong. Dropping in a full table later is a data change; the matcher does not
  move.
- Shown on the review page header and on every game-history row.

**Not backfilled.** Games saved before 2026-09-08 keep a null opening. Filling them
would mean a write on a read path or a migration script, for a cosmetic label on
games nobody is looking at.

**Status: DONE.** 6 unit tests in `openings.spec.ts` (longest match wins, stays
named once the game leaves the book, no match for an irregular opening) and 3 live
checks folded into `verify-hardening.mjs` (E1: both columns written, `[ECO "C20"]`
and `[Opening]` in the PGN of a real socket game). Both builds clean, 20/20 unit.

## Previously In Progress
`feature/analysis-ui` — **Analysis increments 4 + 5: the game review page.**

Cut from `dev` on 2026-09-08. Increment 2 left working endpoints that nothing
called; this is the half a player can see.

**What shipped**
- `frontend/src/pages/GameReview.tsx` at `/review/:gameId` — eval bar, a board
  replayed from the stored SAN list, arrow keys / buttons / a clickable move list,
  `?!` `?` `??` annotation in standard chess notation (a good move gets no mark),
  a verdict card for the move on the board, and per-player accuracy with a
  classification tally.
- **Opening the review queues the sweep** — increment 5's "auto-trigger". The user
  navigated here on purpose; a button to press first would be ceremony. The page
  polls every 2s and fills in when the analysis lands.
- Links in from every game-history row and from the game-over modal. That needed a
  backend line: `game_over` now carries the persisted `gameId` (null for
  vs-computer games, which are never saved), so the modal has something to link to.
- Accuracy is a **panel, not a modal**. A modal you have to dismiss to reach the
  board it is describing is the wrong shape.

**Two library defects found by looking at the rendered page, not the types.**
- The board overlapped the accuracy panel. `react-chessboard` v1.3 measures its
  parent once and has no resize observer, so a percentage width leaves it at its
  560px default; `boardWidth` is now driven explicitly. The live game board has the
  same latent issue and gets away with it because its move panel is narrow enough.
- The engine's suggested move was drawn with `customArrows` — and rendered in
  react-chessboard's default orange, in a design system that has no orange, because
  the per-arrow colour element is ignored. Worse, the library clears arrow state
  from a timeout tied to the piece animation, so on a board driven entirely by
  external position changes the arrow vanished a few hundred ms after every step.
  Replaced with inset square rings via `customSquareStyles`: a plain prop that
  survives, and it matches how the live board already marks squares. Animation is
  off (`animationDuration={0}`) — sliding a piece to depict a jump from ply 30 back
  to ply 4 depicts something that never happened.

**Status: DONE, 19/19 in a real browser** (`backend/scripts/verify-review-ui.mjs`).
Both builds clean.

**Playwright now runs here, and item 3 is closed.** It is deliberately *not* a
dependency — both browser scripts document the unsaved install
(`npm install --no-save playwright && npx playwright install chromium`). With it:
- `verify-review-ui.mjs` — 19/19. Logs in through the real form, follows a history
  row into the review, waits out a live sweep, and asserts the board agrees with the
  ply counter square by square (the queen leaves h5 for f7 and comes back), the
  blunder is marked `Nf6??`, the mating move is not marked, the hint rings land on
  g7-g6, and nothing renders in the library's default orange.
- `verify-pages.mjs` — 16/16. Every route, logged out and logged in, asserting each
  one drew its own content rather than a blank page under the navbar — measured on
  `<main>`, since a blank page still has a navbar. That is the exact failure the
  hardening pass found twice (`/players`, `/profile/edit`). Zero console errors on
  any route.

Two of the failures in those runs were the *scripts* being wrong, not the app: f7
holds Black's pawn until the queen takes it, and the leaderboard's heading is "THE
FOOD CHAIN", not the word "leaderboard".

## Previously In Progress
`feature/stockfish-inc2` — **Stockfish Increment 2: server-side post-game analysis.**

Cut from `dev` on 2026-09-07. The backend `stockfish/` module was deleted in the v1
scope cut, so this started from nothing rather than from the old placeholder.

**How the server gets an engine — the open question Inc 2 had to answer.** It runs
the *same* `stockfish-18-lite-single` WASM build the browser already uses, as a
**child process** speaking plain UCI over stdio. Two things were tried first:

- In-process was never an option. A depth-18 sweep of an 80-ply game is ~47s of
  solid CPU, and on a single-instance monolith (ADR-0032) that stalls every socket
  and every request for the duration.
- A `worker_threads` worker was written, and **failed at runtime**: the engine’s
  emscripten build claims `worker_threads` for its own pthread plumbing, so inside
  a Worker it never assigns `module.exports` and `initEngine` throws "Could not load
  the engine correctly." `typeof require(engine)` is `function` on the main thread
  and `object` in a Worker. A child process is both immune to that and a cleaner
  CPU boundary, and it deleted a file and a custom message protocol.

No BullMQ. Bull went with ADR-0032, and the queue here is a promise chain over one
engine: one sweep at a time, at most 3 games waiting, 503 past that. Redis is not
involved — restarting the server just means the next POST restarts the sweep, which
is strictly better than a `RUNNING` row stuck in Postgres.

**What shipped**
- `backend/src/analysis/` — `classify.ts` (pure scoring), `analysis.service.ts`
  (engine + queue + sweep), controller, module. `POST /analysis/:gameId` (authed —
  the only route that costs real CPU) queues and returns immediately;
  `GET /analysis/:gameId` (public, like `GET /games/:id`) returns
  `done` / `running` / `none`.
- **N+1 evaluations for N moves**, not 2N: the position after move i is the position
  before move i+1, so every eval is read by two moves. That halves the sweep.
- `GameAnalysis` table (one row per game, `ON DELETE CASCADE`), migration
  `20260907180922_add_game_analysis` — one `CREATE TABLE` plus its FK, nothing else.
  Analysis is computed once and kept: same moves, same depth, same numbers, so a
  second viewer costs no engine time.
- Classification on clamped centipawn loss (BEST / EXCELLENT <20 / GOOD <50 /
  INACCURACY <100 / MISTAKE <250 / BLUNDER) and Lichess-formula accuracy. Evals are
  clamped to ±1000 first, so going from +25 pawns to +12 is not a blunder.

**Status: DONE, 14/14 live** (`backend/scripts/verify-analysis.mjs`) and 14/14 unit
(`classify.spec.ts` — the first `.spec.ts` in a repo that had Jest configured and
zero tests). `tsc --noEmit` + `nest build` clean.

- Morphy’s Opera Game: 33 plies in 21s, White 98.2% vs Black 89.1%, worst loss
  W 34cp / B 203cp, `Rd8#` scored BEST.
- An 80-ply game in 47.5s — inside the increment’s 120s budget — while unrelated
  API requests stayed at **10ms**, which is the whole reason the engine is out of
  process.
- A second POST on an analysed game returns the stored row in 4ms.

**One bug that only the live run could show.** `mate: 0` — "the side to move is
checkmated" — is a fixed point under negation, so flipping it to the mating
player’s point of view left it reading as a total loss. The checkmating move came
back as the game’s worst blunder and cost White ~6 accuracy points (92.4 → 98.2
after the fix). Pure unit tests never saw it because it only appears where the
terminal position meets the point-of-view flip. `invert()` now writes that case out
explicitly, and both suites guard it.

**Also corrected while here:** `docs/architecture/database-schema.md` still
documented a whole MongoDB section — including an `Analysis` *collection* — plus
five BullMQ queues, `spectators`, and four Redis keys no code ever wrote. Mongo and
Bull have been gone since 2026-07-19. Same class of doc-vs-code contradiction as
ADR-0004 and ADR-0009; corrected rather than left next to a real `GameAnalysis`
table.

## Previously In Progress
`feature/pre-inc2-hardening` — close every known defect before Stockfish Inc 2.

Cut from `dev` on 2026-08-16. Both compilers were already clean, so everything
here is runtime, UX or consistency. Found by a full read of `backend/src` +
`frontend/src` against the docs; each item was verified at its call site.

- **Security.** `GET /games/history/:userId` had **no guard** — usernames are
  public and `GET /users/:username` returns `id`, so username → id → anyone's
  full game history needed zero login. Guarded. `join_room`'s waiting→active
  branch had no membership check, so any authed socket that learned a room id
  could flip it to `active` and start white's clock before white connected;
  non-players now get a read-only `game_state` snapshot and return. Origin
  reflection (`CORS_ORIGIN=*`) kept as the tunnel-demo escape hatch but now logs
  a `[SECURITY]` warning on boot.
- **Game path.** `Game.tsx` froze `roomId` in `useState`, so a rematch navigated
  to the new room while the board stayed wired to the finished one — **rematch
  was dead**. Now derived from `useParams` with `<ChessGame key={roomId}>`.
  `ChessGame` never re-emitted `join_room` after a socket reconnect, so any
  network blip silently froze the game (socket.io restores the connection, not
  server-side room membership) — fixed with the same `connect` re-emit
  `useMatchmakingSocket` already used.
- **Latency.** Moves were fully round-trip-bound: the board is controlled by
  server `fen`, so the piece snapped back until `move_made` returned. Moves now
  apply optimistically and reconcile against the server, with `invalid_move` as
  the rollback path. Separately: the client never sent `promotion`, so the
  server's chess.js rejected **every promoting move** — now auto-queens.
  `Clock`/`PlayerBar` were declared inside `ChessGame`'s render body and so
  remounted their DOM once per second on every clock tick; hoisted to module
  scope.
- **Silent failures.** Nothing listened for the gateways' `error` event
  (`ALREADY_IN_QUEUE`, `Room not found`, `Not authenticated`) or for
  `reconnect_failed`. All now surface as toasts, and `connect_error` refreshes
  the access token once before the retries continue.
- **Dead UI, wired not deleted.** Profile read `user.rating/wins/losses/recentGames`,
  none of which `/auth/me` returns — it showed **0/0/0 for every user**. Now
  reads the existing `/users/:username/stats` (which already carries per-variant
  wins/losses/draws) plus recent games. `PlayerList` called `GET /players`, which
  never existed; added `GET /users` (paged, capped, explicit select — no
  `passwordHash`/`email`) and wired the previously-unused `PlayerCard` into it.
  `/profile/edit` and any bad URL rendered blank pages; added the edit page (on
  the existing `PATCH /users/me`) and a catch-all 404 route.
- **Backend hygiene.** `updateScore` did 6 serial Redis round trips per player on
  the game-over path (12 per rated game) — pipelined. `REFRESH_TOKEN_EXPIRES_DAYS`
  was never read (30d hardcoded twice) — wired. Expired refresh tokens
  accumulated forever behind a comment claiming a cron that does not exist — now
  swept on login. `Game.pgn` had no producer and was always `""` — now written.
  Dropped `@@index` duplicates of `@unique` columns, the dead `online:` Redis key,
  `expiredDeadlines()`, and the `variant` DTO field both services ignored while
  validating (a client could ask for bullet at 1800s and be rated rapid).
- **Docs.** `api-reference.md` documented 7 deleted modules plus routes that never
  existed, and marked the unguarded history route as authed. `websocket-events.md`
  invented `/game` and `/matchmaking` namespaces (both gateways share the default
  one) and a `get_queue_status`/`queue_stats` pair that was never built, while
  omitting the implemented rematch events. README still advertised MongoDB +
  BullMQ and a 12-module backend. All corrected; `docs/features/**` explicitly
  marked frozen.

**Status: DONE, verified 19/19 live** (`frontend/scripts/verify-hardening.mjs`).
Both builds clean (`tsc --noEmit` + `nest build` + `vite build`).

- Migration `20260815204254_drop_redundant_indexes` applied — exactly three
  `DROP INDEX` statements (`User_username_idx`, `User_email_idx`,
  `RefreshToken_token_idx`), nothing else; `migrate status` clean.
- Verified live: unauth'd history → 401 / authed → 200; an observer's
  `join_room` neither broadcasts `game_start` nor starts the clock (players
  still get a full 300000/300000); `GET /users` returns id/username/rating with
  **no** `passwordHash` or `email`; per-variant stats populate Profile; a
  duplicate `join_queue` now actually reaches the client as
  `ALREADY_IN_QUEUE`; `Game.pgn` is written with real movetext and a `Result`
  tag; all three leaderboard tiers still populate after the pipelining change,
  with own-rank working per period.
- The `[SECURITY]` CORS warning fires on `CORS_ORIGIN=*` (checked on a
  throwaway port).
- Leaderboard reseed exercised against a scratch Redis db: 304 rating rows →
  all/week/month keys in the documented shape.

**One bug found by running it that the compiler could not see.** The new
`LeaderboardService.onModuleInit` ran *before* `RedisService.onModuleInit` had
assigned `this.client` — Nest gives no ordering guarantee between two providers'
`onModuleInit` — so every boot logged `Leaderboard seed failed:
Cannot read properties of undefined (reading 'exists')`. The seed's own
try/catch kept it from blocking startup, which is exactly why only a real boot
surfaced it. Fixed in `2d792a1` by building the Redis client in the
**constructor**, which removes the hazard for every future consumer.

Watch out when re-running: a stale watch-mode server holds `:3100` and the
restart dies with `EADDRINUSE` while the old code keeps serving. Kill the port
before trusting a verify run (same trap noted during `feature/server-clocks`).

## Previously In Progress
`feature/leaderboard-polish` — Leaderboard increments 2 + 3. DONE, verified 16/16.

- **Inc 2 (backend):** period-bucketed ZSETs `leaderboard:{week:isoWeek|month:yyyy-mm}:{variant}`,
  self-expiring via TTL (week 14d / month 62d, re-armed on each write); `updateScore` now
  writes all-time + current-week + current-month. 60s read-cache (`cache:leaderboard:…`) on
  the enriched top-N; empty boards uncached so a first game shows immediately. `?period=`
  on `GET /leaderboard` and `/leaderboard/rank/:id`; invalid period → all-time.
  **Design note:** live boards ("who's rated-active this week"), NOT start-of-period
  snapshots — cron-free; variance recorded in `database-schema.md`.
- **Inc 3 (frontend):** period segmented control under the variant tabs; own-rank row
  (via `/leaderboard/rank`) shown only when you're outside the top 100, with an
  "unrated → play a game" prompt when rank is null; "(you)" ring highlight when you're on
  the visible board.
- **Verified live 16/16** (`frontend/scripts/verify-leaderboard.mjs`): all/week/month boards
  carry both players with correct winner>loser>baseline ratings; own-rank per period;
  unplayed variant → null rank; Redis buckets match the documented key shape; invalid
  period falls back to all-time.

## Previously In Progress
`fix/join-room-authz` — security fix from the ts-migration ultrareview. DONE, verified.

- **Non-player join_room + disconnect could forfeit the real black player.** `handleJoinRoom`
  stamped `client.data.roomId` for ANY authed socket; on disconnect, a non-player's userId
  fell through to `color='black'` (`whitePlayer.id === userId ? 'white' : 'black'`), arming
  the 60s abandonment timer → 60s later the actual black player lost a *rated* ABANDONED
  game. Pre-existing (predates server-clocks); the CAS work made the bad settlement more
  reliable, which is how the review surfaced it.
- **Fix:** stamp `client.data.roomId` only for players (`isWhite || isBlack`) — its sole
  consumer is the abandonment timer, so non-players can no longer arm it. Plus a
  defense-in-depth membership check in `handleDisconnect` so a non-player userId never
  resolves to a color. Non-players may still observe (soft-spectate) — behavior unchanged.
- **Verified live (`frontend/scripts/verify-join-authz.mjs`), 2/2:** exploit is dead
  (non-player join+disconnect leaves the game untouched after 64s) AND control still works
  (real black player's disconnect → white wins by ABANDONED after 60s).

`feature/ts-migration` — frontend fully on TypeScript. DONE, merged.

- All 27 files under `frontend/src` renamed JSX/JS → TSX/TS (via `git mv`, history
  preserved) and typed. `tsconfig.json` with `strict: true`, `noEmit`, `react-jsx`.
- **Contract layer** `src/types.ts`: socket event payloads (`GameStartPayload`,
  `MoveMadePayload`, `GameOverPayload`, `ClockSyncPayload`, `MatchFoundPayload`, …) and
  REST responses (`AuthResponse`, `GameRecord`, `LeaderboardRow`, …) transcribed straight
  from `docs/architecture/websocket-events.md` + `api-reference.md`. Every gateway
  `socket.on(...)` handler and `api.post<T>` call is now typed against these — a payload
  mismatch with the NestJS server is a compile error.
- Order: boundaries first (`api.ts`, both contexts, both hooks), then components, then
  pages, then the big `ChessGame.tsx` last.
- **Gotcha fixed:** `@types/react` came in as v19 against React 18 runtime — pinned both
  `@types/react`/`@types/react-dom` to ^18 so the type major matches the runtime major.
- `tsc --noEmit` added to the `build` script + a standalone `typecheck` script.
- Verified: `tsc --noEmit` 0 errors, `vite build` clean (1788 modules), `vite dev`
  transforms the full entry graph (`index.tsx` → `ChessGame.tsx`) with 0 resolution
  errors. Pure refactor — no runtime behavior change intended or made.

## Previously In Progress
`feature/server-clocks` — ALL FIVE sprint items DONE and live-verified; merged to `dev`.

- **#3 `prisma.$transaction`**: game row + both rating upserts commit atomically in
  `saveCompletedGame` (leaderboard ZADDs stay outside — Redis can't join a PG tx).
- **#4 ThrottlerGuard as APP_GUARD**: verified with a 20-parallel burst → exactly
  10 pass / rest 429 per the `short` (10/s) window. Global guards don't bind to WS
  gateways, so socket traffic is unaffected.
- **#5 `VITE_SERVER_URL`**: ONE origin-only env var replaces the hardcoded
  `localhost:3000` in BOTH `SocketContext.jsx` and `api.js` (the sprint item named only
  the socket; api.js had the identical deploy blocker). `frontend/.env.example` added;
  `environment.md` updated (supersedes the planned VITE_API_URL/VITE_WS_URL pair).

- **#1 Server clocks (ADR-0004)**: `clock:deadlines` Redis ZSET; deadline = lastMoveAt +
  remaining + 500ms grace, re-armed on every move; one 1s sweeper in `GameGateway`
  flags expired games (persisted + rated — the hung-game bug is closed) and pushes
  `clock_sync` to every active room; move path judges flag-fall on raw time BEFORE
  increment (fixed latent bug) and honors the grace window; `claim_timeout` re-verifies
  live remaining. Frontend: `clock_sync` listener corrects local interpolation.
- **#2 Room CAS**: `ActiveRoom.version` + Lua compare-and-set (`casSaveRoom`); all
  gateway mutations CAS + rerun-on-conflict; terminal moves claim `ended` in the same
  write as the move; `claimEnd` makes racing enders (sweeper / claim / resign /
  disconnect) settle exactly once. Bonus: player-guards added to resign / draw /
  claim_timeout / rematch (any authed socket could previously end any game).
- **Verified 8/8 live** (`frontend/scripts/verify-clocks.mjs`): hung-game auto-flag +
  rating, 1s monotonic clock_sync, in-grace late move accepted (clock clamps to 0),
  double-resign settles once. Beware: first run hit a stale 3:57am server on :3000
  (EADDRINUSE in watch logs) — kill port 3000 before trusting a verify run.

## Blocked
_Nothing blocked._

## Next Up (in order)

1. **Promote: `dev` → `staging` → `main`.** `dev` and `origin/dev` are level, so
   this is now two PRs, not a push. The first one also proves the pipeline — it has
   never run on GitHub. Turn on branch protection for `staging` and `main` at the
   same time (`docs/infrastructure/ci-cd.md` §5) or the promotion job stays
   advisory.

2. **Decide whether Playwright becomes a real devDependency.** It is installed
   unsaved right now, which means the two browser scripts only run for whoever
   installs it by hand. The optimistic-move and rematch paths still have no browser
   coverage — they need two sockets in two contexts, which is a bigger script than
   the walk-through.
3. **Nothing else is queued.** All twelve v1 increments that ADR-0032 kept are
   done. What remains is the deferred set (chat, notifications, puzzles,
   tournaments, social, spectate) and Frontend UI increments 1-6 — Zustand, React
   Query, sound, board themes, dark mode, mobile/a11y. See `docs/FUTURE_SCOPE.md`
   and pick, rather than assuming an order.

## Branch Order
```
feature/*  fix/*  chore/*  docs/*  →  dev  →  staging  →  main
```
Everything is cut from `dev` and merged back with `--no-ff`. `staging` and `main`
move by merge only. `hotfix/*` is the one branch allowed to go straight to `main`,
and is not finished until it is merged back into `dev` too.

CI enforces the order on every PR. Rules and the branch-protection settings that
make it binding: `docs/infrastructure/ci-cd.md`.

The old `main → feature/<each of twelve>` list that lived here was the `plan`-branch
sequence from before `dev` existed. Five of those twelve were cut by ADR-0032.

---

## Architecture Decision — 2026-07-19

**Stack locked:** Node/NestJS + PostgreSQL + Redis + Socket.io + React→TypeScript.
**Path locked:** Architecture A (modular monolith, one instance) now → B (socket-layer
split) when measured. D/E/F/G (Go / Elixir / Rust / Durable Objects) deferred, not
rejected. Recorded in `docs/architecture/ADR-0032-monolith-now-socket-split-later.md`.
`Here_is_THE_plan.md` §4 (15 microservices) is superseded.

**Goal:** a running, correct, basic game first. Features added incrementally after.

**Cut from v1:** chat, notifications, puzzles, tournaments, spectate. Puzzles and
tournaments have backend services but no frontend pages. Cutting chat + notifications
deletes the *only* MongoDB consumers — so Mongo is removed with zero migration work,
and the chat authorization hole goes with it.

**Also deleted:** `backend/src/stockfish/` + Bull + the backend `stockfish` dep. Dead and
uncalled since ADR-0009; the processor returns a random legal move with `evaluation: 0`.

**Single-instance is a deliberate, recorded constraint.** Three things are correct on one
process and silently wrong on two — the unwired `@socket.io/redis-adapter`,
`disconnectTimers` (`game.gateway.ts:24`), and `activeKeys`
(`matchmaking.service.ts:36`). Listed in ADR-0032 under "Before adding a second instance".

### Doc-vs-code contradiction found — ADR-0004 never implemented

**ADR-0004 (Server-Authoritative Clock) is Accepted and was never built.** No per-game
`setInterval`, no `clock_update` event, no 500ms grace margin. Clocks advance only when a
move arrives (`game.gateway.ts:180-186`); timeout is detected only via a client-sent
`claim_timeout` (`:317`). A game whose opponent closes their browser hangs until the
86400s room TTL, is never persisted, and never settles ratings. Same class of
contradiction as the ADR-0009 one resolved on 2026-07-12.

Being implemented as a **single Redis sorted-set deadline sweeper**, not one interval per
game — one timer instead of N, and deadlines survive restart. Variance recorded as an
ADR-0004 addendum.

### First sprint — must fix before v1 ships

| # | Item | Why it can't wait |
|---|---|---|
| 1 | ~~Server clocks (ADR-0004)~~ ✅ `feature/server-clocks` | games hang forever; never saved, never rated |
| 2 | ~~Room CAS (`version` + Lua)~~ ✅ `feature/server-clocks` | lock-free read-modify-write on the move path — real on **one** instance |
| 3 | ~~`prisma.$transaction` in `saveCompletedGame`~~ ✅ `feature/server-clocks` | 3 unguarded sequential writes; crash ⇒ ratings silently wrong |
| 4 | ~~Register `ThrottlerGuard` as `APP_GUARD`~~ ✅ `feature/server-clocks` | configured in `app.module.ts`, never registered — nothing is throttled |
| 5 | ~~Socket URL → env var~~ ✅ `feature/server-clocks` (`VITE_SERVER_URL`, covers api.js too) | `SocketContext.jsx:19` hardcodes `localhost:3000` — deploy blocker |

Recurring pattern worth a PR-review checklist item: **infra gets configured but not
wired.** The Redis adapter, the Throttler guard, and Jest (0 `.spec.ts` files) are all
present, configured, and inert.

Full analysis: `temp_architecture.md` (options + trade-offs), `temp_everything.md`
(11 ranked findings, scaling math, per-component verdicts).

---

## How to Resume a Session

1. Read this file first
2. Check `docs/PROGRESS.md` for exact increment status
3. Open the feature folder for whatever is ⏳ Next Up
4. Read `START_HERE.md` in that folder
5. Copy `IMPLEMENTATION_PROMPT_INCREMENT_N.md` into a new conversation to implement

---

## Merged to `dev`, previously unlogged

These landed in the `81c78e1` merge but had no sprint entry until 2026-08-16:

- `8e1a6d6` — leaderboard: time-scoped boards + 60s cache + period filter & own-rank (logged below)
- `ad5c38a` — default backend port **3000 → 3100**
- `8ea141f` — single-origin proxy + reflectable CORS for zero-deploy demos
- `dd7a1a4` — backend serves the built frontend (one-port demo/prod)

The port move left `:3000` stale across README, `docs/RESUME.md`, `docs/PLAN_SUMMARY.md`
and ~100 references in `docs/features/**`. The live docs are corrected;
`docs/features/**` is marked frozen rather than swept.

---

_Last updated: 2026-08-16 (pre-Increment-2 hardening pass — security, game path,
latency, dead UI, backend hygiene, live docs; migration + live verification still
pending on Docker)_
