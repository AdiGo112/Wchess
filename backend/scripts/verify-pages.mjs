// Browser walk-through of every route (the sprint's long-outstanding item 3).
//
// Several pages have only ever been verified by `tsc` and a production build:
// Profile, /profile/edit, /players, the 404 catch-all and the review page all
// landed without a browser ever rendering them. This opens each route in a real
// Chromium and asserts it drew its own content — not a blank page under the
// navbar, which is exactly the failure the hardening pass found twice.
//
// Needs the built SPA served by the backend on :3100:
//   cd frontend && npm run build
// Playwright is NOT a dependency of this repo — install it unsaved to run this:
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/verify-pages.mjs
import { chromium } from 'playwright';

const ORIGIN = 'http://localhost:3100';
const API = `${ORIGIN}/api/v1`;
const PASSWORD = 'Passw0rd!x';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

/** Routes and a string that only appears once the page has really rendered. */
const PUBLIC_ROUTES = [
  ['/', /play|chess|wchess/i],
  ['/login', /log in/i],
  ['/signup', /sign up|create/i],
  ['/leaderboard', /food chain|top 100|bullet/i],
  ['/players', /player|directory|handle|everyone/i],
  ['/puzzles', /puzzle|soon/i],
  ['/tournaments', /tournament|arena|soon/i],
  ['/this-route-does-not-exist', /404|not found|lost|nowhere/i],
];

const PRIVATE_ROUTES = [
  ['/lobby', /quick|match|challenge|play/i],
  ['/history', /receipts|history|nothing here/i],
  ['/profile', /profile|rating|record|stats/i],
  ['/profile/edit', /save|display name|edit/i],
];

async function makeUser() {
  const username = `pgs${Date.now().toString().slice(-8)}`;
  await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email: `${username}@t.test`,
      password: PASSWORD,
      name: 'Page Probe',
    }),
  });
  return username;
}

async function main() {
  const username = await makeUser();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const errorsByRoute = new Map();
  let route = 'startup';
  const note = (text) => {
    if (/favicon|ResizeObserver|WebSocket|websocket/i.test(text)) return;
    errorsByRoute.set(route, [...(errorsByRoute.get(route) ?? []), text]);
  };
  page.on('console', (m) => m.type() === 'error' && note(m.text()));
  page.on('pageerror', (e) => note(String(e)));

  const visit = async (path, expect) => {
    route = path;
    await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' });
    // A blank page under the navbar still has the navbar, so measure the main
    // element rather than the body.
    const main = await page.locator('main').innerText();
    const ok = expect.test(main) && main.trim().length > 20;
    check(`${path} renders`, ok, ok ? '' : `main had ${main.trim().length} chars`);
  };

  for (const [path, expect] of PUBLIC_ROUTES) await visit(path, expect);

  // Protected routes must bounce a logged-out visitor to the login page.
  route = '/lobby (logged out)';
  await page.goto(`${ORIGIN}/lobby`, { waitUntil: 'networkidle' });
  check('a protected route redirects a logged-out visitor to /login',
    page.url().includes('/login'), page.url());

  await page.locator('#login-username').fill(username);
  await page.locator('#login-password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  check('logging in leaves the login page', !page.url().includes('/login'), page.url());

  for (const [path, expect] of PRIVATE_ROUTES) await visit(path, expect);

  // The catch-all has to survive a nested path too, not just a single segment.
  await visit('/profile/edit/nope/deeper', /404|not found|lost|nowhere/i);

  const noisy = [...errorsByRoute.entries()];
  check('no console errors on any route', noisy.length === 0,
    noisy.map(([r, e]) => `${r}: ${e[0]}`).join(' | '));

  await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'scripts/pages-home.png', fullPage: true });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
