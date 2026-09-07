// Runtime verification for feature/server-clocks:
//  A. sweeper flags a hung game (opponent never claims timeout)
//  B. clock_sync arrives ~1s cadence with decreasing timer
//  C. grace: move landing just after 0 but within 500ms is accepted
//  D. CAS: double-resign race settles the game exactly once
//  E. flagged game is persisted + rated (the original bug: never saved)
//  F. game_over carries the persisted Game id, so the client can link to a review
import { io } from 'socket.io-client';

const API = 'http://localhost:3100/api/v1';
const WS = 'http://localhost:3100';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(username) {
  const body = { username, email: `${username}@t.test`, password: 'Passw0rd!x', name: username };
  await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Passw0rd!x' }),
  });
  const json = await res.json();
  if (!json.accessToken) throw new Error(`auth failed for ${username}: ${JSON.stringify(json)}`);
  return json;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: `Bearer ${token}` }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
    setTimeout(() => reject(new Error('ws connect timeout')), 5000);
  });
}

// Create a challenge with a short clock and have both players join the room.
async function createGame(a, b, timeControl) {
  const res = await fetch(`${API}/matchmaking/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.accessToken}` },
    body: JSON.stringify({ variant: 'bullet', timeControl, creatorColor: 'white' }),
  });
  const { token } = await res.json();
  const acc = await fetch(`${API}/matchmaking/challenge/${token}/accept`, {
    method: 'POST', headers: { Authorization: `Bearer ${b.accessToken}` },
  });
  const json = await acc.json();
  if (!json.gameId) throw new Error(`accept failed: ${JSON.stringify(json)}`);
  return json.gameId; // creator=white (a), accepter=black (b)
}

const suffix = Date.now().toString(36).slice(-5);
const u1 = await register(`clkw_${suffix}`);
const u2 = await register(`clkb_${suffix}`);
const s1 = await connect(u1.accessToken);
const s2 = await connect(u2.accessToken);

// ---------- A + B + E: hung-game flag via sweeper ----------
{
  const roomId = await createGame(u1, u2, 10); // 10s each side
  const syncs = [];
  let over = null;
  s1.on('clock_sync', (d) => { if (d.roomId === roomId) syncs.push(d); });
  const overP = new Promise((r) => s1.on('game_over', (d) => { if (d.roomId === roomId) { over = d; r(); } }));
  s1.emit('join_room', { roomId });
  s2.emit('join_room', { roomId });
  // White never moves; NOBODY claims timeout. Old code: hangs 24h. New: sweeper flags white ~5.5s.
  await Promise.race([overP, sleep(14000)]);
  check('A: sweeper ends hung game without any client claim', !!over,
    over ? `result=${over.result} reason=${over.reason}` : 'no game_over within 14s');
  check('A2: flagged side loses on TIMEOUT', over?.result === 'black' && over?.reason === 'timeout',
    JSON.stringify({ result: over?.result, reason: over?.reason }));
  check('B: clock_sync pushed every ~1s', syncs.length >= 7 && syncs.length <= 13, `${syncs.length} syncs in ~10.5s`);
  const decreasing = syncs.every((d, i) => i === 0 || d.timers.white <= syncs[i - 1].timers.white);
  check('B2: synced white timer monotonically decreasing', decreasing);
  check('E: flagged game persisted + rated', !!over?.ratingChange &&
    typeof over.ratingChange.white.change === 'number',
    JSON.stringify(over?.ratingChange?.white));
  // The review link in the game-over modal is dead without this id.
  check('F: game_over carries the persisted Game id', typeof over?.gameId === 'string' && over.gameId.length > 0,
    `gameId=${over?.gameId}`);
  if (over?.gameId) {
    const res = await fetch(`${API}/analysis/${over.gameId}`);
    const json = await res.json();
    check('F2: that id is analysable', res.status === 200 && ['none', 'running', 'done'].includes(json.status),
      `status=${json.status}`);
  }
  s1.off('clock_sync'); s1.off('game_over');
}

// ---------- C: grace — move after 0 but within 500ms is accepted ----------
{
  const roomId = await createGame(u1, u2, 10); // 10s each
  let moveMade = null; let over = null;
  s1.on('move_made', (d) => { if (d.roomId === roomId) moveMade = d; });
  s1.on('game_over', (d) => { if (d.roomId === roomId) over = d; });
  s1.emit('join_room', { roomId });
  s2.emit('join_room', { roomId });
  await sleep(500);
  // White waits ~10.2s (past 10s budget, inside 10.5s grace), then moves.
  await sleep(9700);
  s1.emit('move', { roomId, from: 'e2', to: 'e4' });
  await sleep(700);
  check('C: move within grace window accepted', !!moveMade && (!over || over.reason !== 'timeout'),
    moveMade ? `san=${moveMade.move.san} whiteClock=${moveMade.timers.white}` : `over=${JSON.stringify(over)}`);
  check('C2: accepted late move clamps clock to 0 (+inc)', moveMade ? moveMade.timers.white === 0 : false,
    `white=${moveMade?.timers?.white}`);
  // cleanup: black resigns so the room doesn't linger
  s2.emit('resign', { roomId });
  await sleep(400);
  s1.off('move_made'); s1.off('game_over');
}

// ---------- D: CAS — simultaneous resigns settle exactly once ----------
{
  const roomId = await createGame(u1, u2, 60);
  const overs = [];
  s1.on('game_over', (d) => { if (d.roomId === roomId) overs.push(d); });
  s1.emit('join_room', { roomId });
  s2.emit('join_room', { roomId });
  await sleep(500);
  s1.emit('resign', { roomId });
  s2.emit('resign', { roomId }); // race: both claim 'ended'
  await sleep(1200);
  check('D: double-resign produces exactly one game_over', overs.length === 1,
    `${overs.length} game_over events; result=${overs[0]?.result}`);
  s1.off('game_over');
}

s1.close(); s2.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
