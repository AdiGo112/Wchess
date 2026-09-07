# WCHESS

**Real-time chess where the server is the only one telling the truth.**

Two people, one board, one clock that doesn't care which browser tab lost focus.
Ratings that admit how sure they are. And a Stockfish that will happily tell you,
move by move, exactly where it went wrong.

React + TypeScript · NestJS · PostgreSQL · Redis · Socket.io · Stockfish WASM

```
7,389 lines of TypeScript   ·   4 migrations   ·   32 ADRs   ·   7 live verification scripts
```

---

## THE ONE IDEA

**The client is a renderer, not a referee.**

Every rule that matters lives on the server. The board you drag pieces on is a
prediction; the Redis room is the fact. If they disagree, the room wins and your
piece snaps back. That single decision is why the interesting parts of this
codebase look the way they do:

| Because the server is authoritative… | …this exists |
|---|---|
| A clock can't be trusted to a browser | One Redis sorted set of deadlines, swept every second (ADR-0004) |
| Two moves can arrive at once | Compare-and-set on the room JSON, in Lua |
| A rating write must not half-happen | Game row + both ratings in one `$transaction` |
| A closed laptop must still lose on time | The sweeper flags it; nobody has to claim it |
| An engine verdict is shared, not personal | Analysis runs server-side and is stored once, for everyone |

The counter-example proves the rule: your **opponent's** moves in a computer game
are computed in *your* browser (ADR-0009), because nothing about them needs to be
trusted. Same Stockfish binary, opposite reasoning.

---

## QUICKSTART

Node 20+, Docker Desktop. Three terminals, four minutes.

```bash
docker compose up -d                    # Postgres :5432 · Redis :6379

cd backend
cp .env.example .env                    # fill in JWT_SECRET
npm install
npx prisma migrate dev
npm run start:dev                       # :3100  ·  Swagger at /api/docs

cd ../frontend
npm install
npm run dev                             # :5173
```

The frontend proxies `/api` and `/socket.io` to the backend, so it is same-origin
and there is no CORS to configure. `VITE_SERVER_URL` exists only for pointing at
a backend somewhere else; empty means "same origin".

**One-port demo.** `npm run build` in `frontend/`, then start the backend. It
serves the built SPA itself, so the entire app — API, sockets, UI — answers on
`:3100`. One port to tunnel, nothing to deploy.

---

## WHAT WORKS

Everything listed here is running, not planned.

**Play.** Quick match with a rating tolerance that relaxes the longer you wait
(±50 → ±400, ADR-0008). Friend challenges as tokened links. Vs-computer at five
difficulties. Optimistic moves, so the piece lands under your cursor and
reconciles with the server afterwards instead of waiting on a round trip.

**Clocks that end games.** Deadlines live in one Redis ZSET and one sweeper — one
timer for every live game, not one per game — and they survive a restart. A game
whose opponent walked away used to hang for 24 hours, unsaved and unrated. Now it
flags on its own.

**Ratings with a conscience.** Glicko-2 per variant, so the system tracks not just
your rating but how confident it is in it. Bullet, Blitz, Rapid, Classical, each
scored separately.

**Leaderboards** — all-time, this week, this month. Redis sorted sets with
self-expiring period buckets and a 60-second read cache. Live boards, not
snapshots: "who is hot right now", not "who gained the most since Monday".

**THE POST-MORTEM.** Every finished game can be analysed at depth 18 — every ply,
best move, centipawn loss, and a verdict from BEST down to BLUNDER, plus a Lichess
formula accuracy score per player. There is a review board with an eval bar, an
annotated move list (`?!`, `?`, `??`, and nothing at all for a good move — that
is the point), and a ring on the two squares the engine wanted instead.
Computed once, stored forever: the second person to look costs nothing.

**Openings.** Games name themselves. ECO code and opening name are written at
save and exported in the PGN, so your game reads as a game in any viewer.

---

## HOW THE ENGINE RUNS TWICE

Same `stockfish-18-lite` WASM. Two completely different homes, for good reasons.

```
                    OPPONENT MOVES                     POST-GAME ANALYSIS
                    ──────────────                     ──────────────────
      where         your browser, Web Worker           server, child process
      why           costs the server nothing           one verdict for everyone
      cost          your laptop's problem              ~47s for an 80-ply game
      trust         doesn't need any                   a client can't be believed
      ADR           0009                               supersedes 0010
```

Running analysis in-process was never an option: a depth-18 sweep is tens of
seconds of solid CPU, and this is deliberately a single-instance monolith
(ADR-0032). It would stall every socket in the building.

A `worker_threads` worker was written first, and **failed** — the engine's
emscripten build claims `worker_threads` for its own pthread plumbing, so inside
a Worker it never exports its init function. A child process speaking plain UCI
over stdio is immune to that, isolates the CPU properly, and deleted a file and a
message protocol on the way. During a full sweep, unrelated API requests still
answer in **9ms**.

---

## THE LOOK

Strict monochrome neo-brutalism. Ink `#0a0a0a`, paper `#ececec`, white, and the
greys in between. **No hue anywhere** — game state is carried by inversion,
outline, weight and motion instead. Borders are 3px. Corners are square. Depth is
a hard offset shadow, never a blur. Archivo Black shouts, Space Grotesk speaks,
Space Mono counts.

The board fills the frame and the page never scrolls. Your clock inverts and
blinks under thirty seconds, because a red number is just a colour but a blinking
one is a heartbeat.

---

## LAYOUT

```
WChess/
├── docker-compose.yml          — Postgres + Redis, nothing else
├── frontend/
│   ├── scripts/                — live end-to-end checks
│   └── src/
│       ├── pages/              — Lobby, Game, GameReview, Leaderboard, Profile…
│       ├── components/         — ChessGame is the big one
│       ├── context/            — AuthContext, SocketContext
│       ├── hooks/              — useStockfish, useMatchmakingSocket, useBoardFit
│       ├── api.ts              — axios + silent refresh interceptors
│       └── types.ts            — the socket and REST contracts, transcribed
└── backend/
    ├── prisma/schema.prisma
    ├── scripts/                — live end-to-end checks
    └── src/
        ├── auth/               — register / login / refresh / logout
        ├── games/              — lifecycle, gateway, clocks, PGN, ECO
        ├── matchmaking/        — queue pairing, challenges, vs-computer
        ├── leaderboard/        — sorted sets, period buckets, own-rank
        ├── analysis/           — the sweep, the classifier, the engine
        ├── users/              — profiles, per-variant stats, directory
        └── common/             — Prisma, Redis, Glicko-2, CORS
```

---

## PROVING IT

Jest covers the pure logic — the scoring maths and the opening matcher, where a
sign error is invisible in engine output and wrong in the UI.

```bash
cd backend && npx jest                          # 20 tests
```

Everything else is verified **against a running stack**, because the bugs that
mattered in this project were never type errors. A `mate: 0` that a compiler was
perfectly happy with turned a checkmate into the game's worst blunder. A provider
initialisation order Nest makes no promise about. A board library that measures
its parent exactly once.

```bash
node frontend/scripts/verify-clocks.mjs         # server clocks          10/10
node frontend/scripts/verify-leaderboard.mjs    # period boards          16/16
node frontend/scripts/verify-join-authz.mjs     # join_room authz          2/2
node frontend/scripts/verify-hardening.mjs      # security + game path   22/22
node backend/scripts/verify-analysis.mjs        # post-game analysis     14/14
```

And two that drive a real Chromium. Playwright is deliberately **not** a
dependency — install it when you want it and let it go afterwards:

```bash
cd backend && npm install --no-save playwright && npx playwright install chromium

node backend/scripts/verify-pages.mjs           # every route renders    16/16
node backend/scripts/verify-review-ui.mjs       # the review page        22/22
```

Those assert what a screenshot can't: that the board agrees with the ply counter
square by square, that the blunder reads `Nf6??`, that nothing renders in the
board library's default orange, and that the page under the navbar is not blank —
which is exactly the failure mode a passing build hides.

---

## WHAT'S NOT HERE, AND WHY

Chat, notifications, puzzles, tournaments, spectating and the social graph were
**cut on purpose** by ADR-0032, not forgotten. A working, correct, boring game
first; features after. Cutting chat and notifications deleted the only MongoDB
consumers, so the whole database left the stack with zero migration work, and a
known chat authorisation hole went with it.

Their designs, schemas and ADRs are all still in `docs/`. See
`docs/FUTURE_SCOPE.md` for what comes back and what it costs.

**Single instance is a recorded constraint, not an oversight.** Three things here
are correct on one process and quietly wrong on two — an unwired Redis socket
adapter, in-memory disconnect timers, and in-memory queue keys. They are listed
in ADR-0032 under "before adding a second instance", so nobody has to rediscover
them at 3am.

---

## WHERE TO READ NEXT

| You want | Open |
|---|---|
| What is happening right now | `docs/CURRENT_SPRINT.md` |
| Increment-level status | `docs/PROGRESS.md` |
| Getting running after a long break | `docs/RESUME.md` |
| The live REST contract | `docs/architecture/api-reference.md` |
| The live socket contract | `docs/architecture/websocket-events.md` |
| Every algorithm, and where it lives | `docs/ALGORITHMS.md` |
| Why the stack looks like this | `docs/architecture/ADR-0032-*.md` |

> `docs/features/**` is **frozen scaffolding** — written before the scope cut and
> the port move. Trust `docs/architecture/` and `RESUME.md` instead.

---

## BRANCHES

| Branch | Purpose |
|---|---|
| `main` | Stable, deployable |
| `staging` | Pre-release integration |
| `dev` | Where features land first |
| `feature/*` | One per feature, cut from `dev` |

Never commit directly to `main` or `staging`.
