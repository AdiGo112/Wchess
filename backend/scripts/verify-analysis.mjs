// Runtime verification for Stockfish Increment 2 (server-side analysis).
//
// Covers what only a live run can show:
//    1  POST /analysis/:gameId needs auth
//    2  unknown game -> 404
//    3  a real game analyses end to end and lands in Postgres
//    4  every ply comes back, in order, with a classification and an accuracy
//    5  the eval column is White's point of view
//    6  engine moves are labelled BEST
//    7  a delivered checkmate is BEST, not the game's worst blunder
//    8  the weaker side is charged with the bigger losses
//    9  a second request is served from the stored row, not re-analysed
//   10  an 80-ply game finishes inside the increment's 120s budget
//   11  the API stays responsive while the engine burns CPU
//
// Run against a live stack: docker compose up -d, backend on :3100.
//   node scripts/verify-analysis.mjs
import { PrismaClient } from '@prisma/client';
import { Chess } from 'chess.js';

const API = 'http://localhost:3100/api/v1';
const prisma = new PrismaClient();

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Morphy's Opera Game, 1858 — real blunders, ends in mate.
const OPERA = `e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6
Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8
Rd8#`.split(/\s+/);

/**
 * A legal 80-ply game of deterministic pseudo-random moves. Nonsense chess, but
 * it is the length the acceptance criterion names ("a 40-move game in under
 * 120s") and its positions are stranger than a real game's, so the timing it
 * measures is a pessimistic one. Seeds are retried because a random game can
 * end early in mate, stalemate or bare kings.
 */
function longGame(plies = 80) {
  for (let seed = 1; seed <= 50; seed++) {
    let state = seed * 2654435761;
    const rand = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const chess = new Chess();
    const moves = [];
    while (moves.length < plies && !chess.isGameOver()) {
      const legal = chess.moves();
      moves.push(chess.move(legal[Math.floor(rand() * legal.length)]).san);
    }
    if (moves.length === plies) return moves;
  }
  throw new Error('could not build a long game');
}

async function token() {
  const user = `anly${Date.now().toString().slice(-8)}`;
  const body = {
    username: user,
    email: `${user}@t.test`,
    password: 'Passw0rd!x',
    name: 'Analysis Probe',
  };
  // register returns the profile only; the access token comes from login
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: body.username, password: body.password }),
  });
  const json = await res.json();
  if (!json.accessToken) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return json.accessToken;
}

async function seedGame(moves, result = 'WHITE', reason = 'CHECKMATE') {
  const chess = new Chess();
  for (const san of moves) chess.move(san);
  return prisma.game.create({
    data: {
      whiteUsername: 'probe_white',
      blackUsername: 'probe_black',
      result,
      reason,
      timeControl: 300,
      moves,
      fen: chess.fen(),
      pgn: chess.pgn(),
    },
  });
}

async function waitForAnalysis(gameId, budgetMs) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    const res = await fetch(`${API}/analysis/${gameId}`);
    const json = await res.json();
    if (json.status === 'done') return { json, ms: Date.now() - started };
    if (json.status === 'none') return { json, ms: Date.now() - started };
    await sleep(1000);
  }
  return { json: { status: 'timeout' }, ms: Date.now() - started };
}

let probing = true;

async function main() {
  const jwt = await token();
  const auth = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

  const opera = await seedGame(OPERA);

  // 1 — auth is enforced on the CPU-spending route
  const noAuth = await fetch(`${API}/analysis/${opera.id}`, { method: 'POST' });
  check('POST /analysis/:gameId rejects an unauthenticated caller', noAuth.status === 401,
    `got ${noAuth.status}`);

  // 2 — unknown game
  const missing = await fetch(`${API}/analysis/does-not-exist`, { method: 'POST', headers: auth });
  check('POST /analysis on an unknown game returns 404', missing.status === 404,
    `got ${missing.status}`);

  // 3 — the real sweep
  const kick = await fetch(`${API}/analysis/${opera.id}`, { method: 'POST', headers: auth });
  const kickJson = await kick.json();
  check('POST returns immediately with status=running', kickJson.status === 'running',
    JSON.stringify(kickJson));

  const { json: done, ms } = await waitForAnalysis(opera.id, 180_000);
  check('Opera Game analysis completes and is stored', done.status === 'done', `${ms}ms`);
  if (done.status !== 'done') return;

  const row = await prisma.gameAnalysis.findUnique({ where: { gameId: opera.id } });
  check('the analysis is persisted in Postgres', !!row && row.depth === 18,
    `depth ${row?.depth}`);

  // 4 — shape
  const moves = done.moves;
  const ordered = moves.every((m, i) => m.ply === i + 1 && m.san === OPERA[i]);
  check('every ply is returned, in order, matching the game', moves.length === OPERA.length && ordered,
    `${moves.length}/${OPERA.length} plies`);

  const wellFormed = moves.every(
    (m) =>
      typeof m.classification === 'string' &&
      typeof m.cpLoss === 'number' &&
      m.accuracy >= 0 &&
      m.accuracy <= 100 &&
      (m.color === 'w' || m.color === 'b'),
  );
  check('each ply carries a classification, a cpLoss and a 0-100 accuracy', wellFormed);

  // 5 — White's point of view: White delivers the mate, so the column ends high.
  const last = moves[moves.length - 1];
  check("the eval column is White's point of view (White's mate reads positive)",
    last.evalCp > 0, `evalCp ${last.evalCp}, mate ${last.mate}`);

  // 6 — verdicts. 1. e4 is an engine move; the mating move must be the best one.
  const byPly = (n) => moves[n - 1];
  check('1. e4 is scored BEST', byPly(1).classification === 'BEST',
    `${byPly(1).classification}, best=${byPly(1).bestMove}`);

  // 7 — regression guard: `mate: 0` is a fixed point under negation, so before
  // invert() handled it the mating move came back as the game's worst blunder.
  check('the checkmating move is scored BEST, not a blunder',
    last.classification === 'BEST' && last.cpLoss === 0,
    `${last.san} -> ${last.classification}, cpLoss ${last.cpLoss}`);

  const worst = (color) =>
    Math.max(...moves.filter((m) => m.color === color).map((m) => m.cpLoss));
  check('Black gives away more than White in a game Morphy mates in 17',
    worst('b') > worst('w') && done.accuracyWhite > done.accuracyBlack,
    `worst W ${worst('w')}cp / B ${worst('b')}cp, accuracy W ${done.accuracyWhite} vs B ${done.accuracyBlack}`);

  // 8 — cached
  const t0 = Date.now();
  const again = await fetch(`${API}/analysis/${opera.id}`, { method: 'POST', headers: auth });
  const againJson = await again.json();
  check('a second request is served from the stored row', againJson.status === 'done'
    && Date.now() - t0 < 2000, `${Date.now() - t0}ms`);

  // 9 — the 120s budget on a full-length game, and 10 — the reason the engine
  // runs out of process at all: the API must stay responsive while it burns CPU.
  const longMoves = longGame(80);
  const long = await seedGame(longMoves, 'DRAW', 'AGREEMENT');
  await fetch(`${API}/analysis/${long.id}`, { method: 'POST', headers: auth });

  let slowest = 0;
  const probe = (async () => {
    while (true) {
      const t = Date.now();
      const res = await fetch(`${API}/leaderboard?variant=blitz&limit=1`);
      await res.json();
      slowest = Math.max(slowest, Date.now() - t);
      if (!probing) return;
      await sleep(250);
    }
  })();

  const { json: longDone, ms: longMs } = await waitForAnalysis(long.id, 180_000);
  probing = false;
  await probe;

  check(`an ${longMoves.length}-ply game analyses inside 120s`,
    longDone.status === 'done' && longMs < 120_000, `${longMs}ms`);
  check('the API stays responsive while the engine runs',
    slowest < 500, `slowest unrelated request during the sweep: ${slowest}ms`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
