// Browser verification for feature/board-input:
//   C  click-to-move in a live game: click a piece shows target hints, click a target moves
//   P  promotion picker: pawn reaches the 8th rank, the picker opens, picking a knight
//      sends promotion 'n' and the server records bxa8=N
//   G  /play works logged out: a click move gets a Stockfish reply, take-back undoes it
//   R  after a rated game ends, the result screen offers Review and Analyze
//   L  a practice game opens in the review without analysis; 'Analyze game' runs
//      Stockfish in the browser and fills in accuracy and the blunder mark
//   E  zero console errors
//
// Needs the built SPA served by the backend on :3100 (`cd frontend && npm run build`),
// started with AUTH_RATE_LIMIT=1000. Playwright is not a dependency:
//   npm install --no-save playwright && npx playwright install chromium
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
// socket.io-client is a frontend dependency; borrow it rather than add it to the backend.
const { io } = createRequire(new URL('../../frontend/package.json', import.meta.url))('socket.io-client');

const ORIGIN = 'http://localhost:3100';
const API = `${ORIGIN}/api/v1`;
const PASSWORD = 'Passw0rd!x';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};
const post = (path, body, token) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const waitFor = (s, ev, pred = () => true, ms = 8000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => { s.off(ev, h); resolve(null); }, ms);
    const h = (d) => { if (pred(d)) { clearTimeout(t); s.off(ev, h); resolve(d); } };
    s.on(ev, h);
  });

async function account(prefix) {
  const username = `${prefix}${Date.now().toString(36).slice(-6)}`;
  await post('/auth/register', { username, email: `${username}@t.test`, password: PASSWORD, name: prefix });
  const { accessToken, user } = await (await post('/auth/login', { username, password: PASSWORD })).json();
  return { username, accessToken, id: user.id };
}

const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
};
const square = (page, sq) => page.locator(`[data-square="${sq}"]`);

// ---------- C + P: live game, white in the browser, black a socket ----------
{
  const w = await account('bw');
  const b = await account('bb');
  const { token } = await (await post('/matchmaking/challenge', { timeControl: 300, creatorColor: 'white' }, w.accessToken)).json();
  const { gameId: roomId } = await (await post(`/matchmaking/challenge/${token}/accept`, {}, b.accessToken)).json();

  const black = io(ORIGIN, { auth: { token: `Bearer ${b.accessToken}` }, transports: ['websocket'] });
  await new Promise((r) => black.on('connect', r));
  black.emit('join_room', { roomId });

  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  watch(page);
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'networkidle' });
  await page.locator('#login-username').fill(w.username);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'));
  await page.goto(`${ORIGIN}/game/${roomId}`, { waitUntil: 'networkidle' });
  await waitFor(black, 'game_start', () => true, 5000);

  // Click e2: e3 and e4 get a hint dot.
  await square(page, 'e2').click();
  // The style lands on an inner div of the square, so read the square's whole subtree.
  const hint = await square(page, 'e4').evaluate((el) => (el.outerHTML.match(/radial-gradient/) || ['none'])[0]);
  check('C1: clicking a piece marks its targets', hint.includes('radial-gradient'), hint.slice(0, 40));

  // White by clicks only; black answers over the socket. Ends with b7xa8.
  const line = [['e2', 'e4', 'd7', 'd5'], ['e4', 'd5', 'c7', 'c6'], ['d5', 'c6', 'g8', 'f6'], ['c6', 'b7', 'b8', 'd7']];
  let clicked = 0;
  for (const [i, [wf, wt, bf, bt]] of line.entries()) {
    if (i > 0) await square(page, wf).click();
    const wMove = waitFor(black, 'move_made', (d) => d?.move?.from === wf && d?.move?.to === wt);
    await square(page, wt).click();
    if (await wMove) clicked++;
    const bMove = waitFor(black, 'move_made', (d) => d?.move?.from === bf);
    black.emit('move', { roomId, from: bf, to: bt });
    await bMove;
    await page.waitForTimeout(300);
  }
  check('C2: four click-moves reached the server', clicked === 4, `${clicked}/4`);

  await square(page, 'b7').click();
  await square(page, 'a8').click();
  const dialog = page.getByRole('dialog', { name: 'Choose a promotion piece' });
  check('P1: promotion picker opens', await dialog.isVisible());
  const promo = waitFor(black, 'move_made', (d) => d?.move?.to === 'a8');
  await dialog.getByRole('button', { name: 'Knight' }).click();
  const made = await promo;
  check('P2: picking a knight promotes to a knight', made?.move?.san === 'bxa8=N', made?.move?.san);
  check('P3: picker closes', !(await dialog.isVisible()));

  // ---------- R: the result screen offers both ----------
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('link', { name: 'Analyze' }).waitFor({ timeout: 8000 }).catch(() => {});
  const review = await page.getByRole('link', { name: 'Review', exact: true }).getAttribute('href').catch(() => null);
  const analyze = await page.getByRole('link', { name: 'Analyze' }).getAttribute('href').catch(() => null);
  check('R: game over offers Review and Analyze', !!review && /^\/review\/[^/?]+$/.test(review) && analyze === review + '?analyze=1', `${review} | ${analyze}`);
  await page.getByRole('link', { name: 'Analyze' }).click();
  await page.waitForFunction(() => /judging you|accuracy/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
  check('R2: Analyze opens the review with the server sweep already started',
    /judging you|accuracy/i.test(await page.locator('body').innerText()));

  black.disconnect();
  await page.close();
}

// ---------- G: guest practice game ----------
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  watch(page);
  await page.goto(`${ORIGIN}/play`, { waitUntil: 'networkidle' });
  check('G1: /play opens without logging in', page.url().endsWith('/play'), page.url());
  await square(page, 'e2').click();
  await square(page, 'e4').click();
  const moves = page.locator('ol li');
  // The third cell (black's reply) renders empty first, so wait for text in it.
  await page.waitForFunction(() => document.querySelectorAll('ol li span')[2]?.textContent, null, { timeout: 20000 }).catch(() => {});
  const cells = await page.locator('ol li span').allTextContents();
  check('G2: click move + Stockfish reply', cells[1] === 'e4' && !!cells[2], cells.join(' '));
  await page.getByRole('button', { name: 'Take back' }).click();
  check('G3: take back clears both moves', (await moves.count()) === 0);
  await page.close();
}

// ---------- L: practice game review, engine in the browser ----------
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  watch(page);
  await page.goto(`${ORIGIN}/play`, { waitUntil: 'networkidle' });
  // What the end-of-game buttons do: hand the moves over in router state.
  await page.evaluate(() => {
    const usr = { moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'], white: 'You', black: 'Stockfish' };
    history.pushState({ usr, key: 'probe', idx: 1 }, '', '/review/local');
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  });
  await page.getByText('Analyze game').waitFor({ timeout: 5000 }).catch(() => {});
  const before = await page.locator('body').innerText();
  check('L1: review opens with moves and no analysis running', before.includes('Qxf7#') && /analyze game/i.test(before) && !/judging you/i.test(before));
  await page.getByRole('button', { name: 'Analyze game' }).click();
  const working = await page.getByText(/in your browser/i).isVisible().catch(() => false);
  await page.waitForFunction(() => /accuracy/i.test(document.body.innerText), null, { timeout: 60000 }).catch(() => {});
  const after = await page.locator('body').innerText();
  check('L2: browser analysis shows progress, then accuracy', working && /\d+(\.\d+)?%/.test(after));
  check('L3: the blunder is marked, the mate is not', /Nf6\?/.test(after) && !after.includes('Qxf7#?'));
  await page.close();
}

check('E: no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
