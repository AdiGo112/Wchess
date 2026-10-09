// Runtime verification for feature/spectate:
//  A. GET /games/live lists an active game (and not before it starts)
//  B. a spectator who joins gets a game_state snapshot tagged status='active'
//  C. the spectator receives the players' move_made broadcasts
//  D. the spectator cannot move, resign, or offer a draw
//  E. the spectator disconnecting does NOT arm abandonment (game stays active)
//  F. an ended game drops off /games/live
import { io } from 'socket.io-client';

const API = 'http://localhost:3100/api/v1';
const WS = 'http://localhost:3100';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev, ms = 3000) =>
  new Promise((r) => { const t = setTimeout(() => r(null), ms); s.once(ev, (d) => { clearTimeout(t); r(d); }); });

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

const live = async (u) =>
  (await fetch(`${API}/games/live`, { headers: { Authorization: `Bearer ${u.accessToken}` } })).json();

const suffix = Date.now().toString(36).slice(-5);
const w = await register(`spw_${suffix}`);
const b = await register(`spb_${suffix}`);
const v = await register(`spv_${suffix}`);

const res = await fetch(`${API}/matchmaking/challenge`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.accessToken}` },
  body: JSON.stringify({ timeControl: 300, creatorColor: 'white' }),
});
const { token } = await res.json();
const { gameId: roomId } = await (await fetch(`${API}/matchmaking/challenge/${token}/accept`, {
  method: 'POST', headers: { Authorization: `Bearer ${b.accessToken}` },
})).json();

const unauth = await fetch(`${API}/games/live`);
check('A0: /games/live requires auth', unauth.status === 401, `status=${unauth.status}`);
check('A1: waiting room is not listed', !(await live(v)).some((g) => g.id === roomId));

const sw = await connect(w.accessToken);
const sb = await connect(b.accessToken);
sw.emit('join_room', { roomId });
sb.emit('join_room', { roomId });
await sleep(500);

const listed = (await live(v)).find((g) => g.id === roomId);
check('A2: active game is listed', !!listed && listed.white.username === w.user.username && listed.moveCount === 0,
  JSON.stringify(listed));

// ---------- B: spectator snapshot ----------
const sv = await connect(v.accessToken);
const stateP = once(sv, 'game_state');
sv.emit('join_room', { roomId });
const state = await stateP;
check('B: spectator gets snapshot with status=active', state?.status === 'active' && state?.white?.id === w.user.id,
  JSON.stringify({ status: state?.status }));

// ---------- C: broadcasts reach the spectator ----------
const movedP = once(sv, 'move_made');
sw.emit('move', { roomId, from: 'e2', to: 'e4' });
const moved = await movedP;
check('C: spectator receives move_made', moved?.move?.san === 'e4', moved?.move?.san);

// ---------- D: spectator can't act ----------
const invalidP = once(sv, 'invalid_move');
sv.emit('move', { roomId, from: 'e7', to: 'e5' });
const invalid = await invalidP;
check('D1: spectator move rejected', invalid?.reason === 'Not a player', invalid?.reason);

let over = null;
sw.on('game_over', (d) => { over = d; });
let drawOffered = false;
sw.on('draw_offered', () => { drawOffered = true; });
sv.emit('resign', { roomId });
sv.emit('offer_draw', { roomId });
await sleep(800);
check('D2: spectator resign/draw ignored', !over && !drawOffered);

// ---------- E: spectator leaving does not forfeit anyone ----------
let dc = false;
sw.on('opponent_disconnected', () => { dc = true; });
sv.disconnect();
await sleep(800);
check('E: spectator disconnect arms nothing', !dc && (await live(w)).some((g) => g.id === roomId));

// ---------- F: ended game drops off ----------
const overP = once(sw, 'game_over');
sb.emit('resign', { roomId });
await overP;
await sleep(300);
check('F: ended game leaves /games/live', !(await live(w)).some((g) => g.id === roomId));

sw.disconnect(); sb.disconnect();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
