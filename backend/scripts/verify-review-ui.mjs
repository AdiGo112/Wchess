// Browser verification for the game-review page (Analysis increments 4 + 5).
//
// The one thing the API-level scripts cannot see: whether the page actually
// renders. Drives a real Chromium against the built SPA the backend serves on
// :3100, so this needs `cd frontend && npm run build` first.
//
//   1  /history rows link into /review/:gameId
//   2  the review page renders the board and the full move list before any
//      analysis exists
//   3  it queues its own analysis (increment 5: opening the review IS the
//      request) and shows a working state meanwhile
//   4  the analysis lands and the page fills in: accuracy for both players,
//      annotation marks on bad moves, the eval readout
//   5  stepping (buttons, arrow keys, clicking a move) moves the board
//   6  zero console errors throughout
//
// Playwright is NOT a dependency of this repo — install it unsaved to run this:
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/verify-review-ui.mjs
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { Chess } from 'chess.js';

const ORIGIN = 'http://localhost:3100';
const API = `${ORIGIN}/api/v1`;
const PASSWORD = 'Passw0rd!x';
const prisma = new PrismaClient();

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

// Scholar's mate: short enough to analyse in seconds, and 3...Nf6 is a real
// blunder, so the page has something to annotate.
const MOVES = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];

async function makeUser() {
  const username = `rvw${Date.now().toString().slice(-8)}`;
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@t.test`,
      password: PASSWORD,
      name: 'Review Probe',
    }),
  });
  const user = await prisma.user.findUnique({ where: { username } });
  return { username, id: user.id };
}

async function seedGame(user) {
  const chess = new Chess();
  for (const san of MOVES) chess.move(san);
  return prisma.game.create({
    data: {
      whiteId: user.id,
      whiteUsername: user.username,
      blackUsername: 'probe_black',
      result: 'WHITE',
      reason: 'CHECKMATE',
      timeControl: 300,
      moves: MOVES,
      fen: chess.fen(),
      pgn: chess.pgn(),
    },
  });
}

async function main() {
  const user = await makeUser();
  const game = await seedGame(user);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  // ---- log in through the real form, not by injecting a token ----
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-username').fill(user.username);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  check('logs in through the UI', !page.url().includes('/login'), page.url());

  // ---- 1. history rows link into the review ----
  await page.goto(`${ORIGIN}/history`, { waitUntil: 'networkidle' });
  const link = page.locator(`a[href="/review/${game.id}"]`);
  check('a history row links to the review page', (await link.count()) > 0);
  if (await link.count()) await link.first().click();
  else await page.goto(`${ORIGIN}/review/${game.id}`);
  await page.waitForURL(`**/review/${game.id}`, { timeout: 15000 });

  // ---- 2. the board and move list render before analysis exists ----
  await page.waitForSelector('[data-boardid]', { timeout: 15000 });
  const squares = await page.locator('[data-square]').count();
  check('the board renders 64 squares', squares === 64, `${squares} squares`);
  // The board must not spill over the panel beside it: react-chessboard v1.3
  // measures its parent once and otherwise falls back to a 560px default.
  const overlap = await page.evaluate(() => {
    const board = document.querySelector('[data-boardid]')?.getBoundingClientRect();
    const panel = [...document.querySelectorAll('h3')]
      .find((h) => /accuracy|moves/i.test(h.textContent || ''))?.getBoundingClientRect();
    if (!board || !panel) return null;
    return { boardRight: Math.round(board.right), panelLeft: Math.round(panel.left) };
  });
  check('the board does not overlap the side panel',
    !!overlap && overlap.boardRight <= overlap.panelLeft, JSON.stringify(overlap));

  // The board is meant to fill the frame, sit on the left, and leave the page
  // unscrollable. Before the layout pass it was capped at 500px and the page
  // scrolled.
  const frame = await page.evaluate(() => {
    const board = document.querySelector('[data-boardid]').getBoundingClientRect();
    const doc = document.documentElement;
    const main = document.querySelector('main');
    return {
      board: Math.round(board.width),
      left: Math.round(board.left),
      vh: window.innerHeight,
      vw: window.innerWidth,
      pageScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainScrolls: main ? main.scrollHeight > main.clientHeight + 1 : false,
    };
  });
  check('the board fills the frame', frame.board > frame.vh * 0.6,
    `${frame.board}px in a ${frame.vh}px viewport`);
  check('the board sits on the left', frame.left < frame.vw * 0.25,
    `left edge at ${frame.left} of ${frame.vw}`);
  check('nothing scrolls', !frame.pageScrolls && !frame.mainScrolls,
    `page=${frame.pageScrolls} main=${frame.mainScrolls}`);

  const body = () => page.locator('body').innerText();
  const beforeText = await body();
  check('every move is listed', MOVES.every((m) => beforeText.includes(m)),
    MOVES.filter((m) => !beforeText.includes(m)).join(' ') || 'all present');
  check('the ply counter starts at 0', beforeText.includes(`0/${MOVES.length}`));

  // ---- 3. the page queues its own analysis ----
  check('it reports analysis in progress without being asked',
    /judging you/i.test(beforeText), beforeText.match(/judging you/i) ? '' : 'no working state shown');

  // ---- 4. the analysis lands and fills the page in ----
  await page.waitForFunction(
    () => /accuracy/i.test(document.body.innerText) && /%/.test(document.body.innerText),
    null,
    { timeout: 120000 },
  ).catch(() => {});
  const afterText = await body();
  check('accuracy appears for both players', /accuracy/i.test(afterText) && /\d+(\.\d+)?%/.test(afterText),
    (afterText.match(/\d+(\.\d+)?%/g) || []).slice(0, 2).join(' / '));
  check('the blunder is annotated', afterText.includes('Nf6??') || afterText.includes('Nf6?'),
    afterText.includes('Nf6??') ? 'Nf6??' : afterText.includes('Nf6?') ? 'Nf6?' : 'not marked');
  check('the mating move is not annotated as a mistake', !afterText.includes('Qxf7#?'));

  // ---- 5. stepping ----
  // The board must agree with the counter, not merely change. react-chessboard
  // animates external position changes, so settle before reading the squares.
  const settle = () => page.waitForTimeout(450);
  const occupied = async (sq) => page.locator(`[data-square="${sq}"] svg`).count();

  await page.getByLabel('Last move').click();
  await settle();
  check('jumping to the end updates the ply counter',
    (await body()).includes(`${MOVES.length}/${MOVES.length}`));
  check('at the end the mating queen stands on f7 and h5 is empty',
    (await occupied('f7')) > 0 && (await occupied('h5')) === 0);

  await page.keyboard.press('ArrowLeft');
  await settle();
  check('ArrowLeft steps back one ply', (await body()).includes(`${MOVES.length - 1}/${MOVES.length}`));

  // Clicking Qh5 lands on ply 5 — the position right before Black's blunder, and
  // the only one in this game where the engine wanted something else.
  await page.getByRole('button', { name: /^Qh5/ }).first().click();
  await settle();
  const clicked = await body();
  check('clicking a move in the list jumps to it', /\b5\/7\b/.test(clicked), clicked.match(/\d+\/\d+/)?.[0]);
  // At ply 5 the queen is on h5 and Black has not played Nf6 yet. (f7 is no use
  // as a marker here — Black's pawn sits there until the queen takes it.)
  check('the board follows the click back to that position',
    (await occupied('h5')) > 0 && (await occupied('f6')) === 0,
    `h5=${await occupied('h5')} f6=${await occupied('f6')}`);
  check('the move now on the board has a verdict',
    /(best|excellent|good|inaccuracy|mistake|blunder)/i.test(clicked));

  // The engine hint is square rings, not customArrows: react-chessboard wipes
  // arrow state from its own animation timeout on every external position
  // change, so an arrow vanishes a few hundred ms after each step. These two
  // checks are what would catch a regression back to arrows.
  // customSquareStyles lands on the square div's CHILD, not on [data-square].
  const ringed = await page.evaluate(() =>
    [...document.querySelectorAll('[data-square]')]
      .filter((n) => /inset/.test(n.firstElementChild?.getAttribute('style') || ''))
      .map((n) => n.getAttribute('data-square')));
  check('the engine hint is ringed on two squares', ringed.length === 2,
    ringed.join(' ') || 'nothing ringed');

  const orange = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    return (html.match(/rgb\(255,\s*170,\s*0\)/i) || html.match(/#ffaa00/i) || [''])[0];
  });
  check('nothing renders in the library default orange', orange === '', orange);

  await settle();
  await page.screenshot({ path: 'scripts/review-page.png', fullPage: true });

  // ---- 6. console ----
  const real = consoleErrors.filter((e) => !/favicon|ResizeObserver/i.test(e));
  check('no console errors', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log('screenshot: backend/scripts/review-page.png');
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
