// Runtime verification for feature/pre-inc2-hardening.
//
// Covers the fixes that are observable over the network:
//   A1  GET /games/history/:userId now requires auth
//   A2  a non-player's join_room can't start a waiting room's clock
//   B5  gateway `error` events actually reach the client (ALREADY_IN_QUEUE)
//   C3  GET /users exists and never leaks passwordHash/email
//   C2  GET /users/:username/stats returns what Profile renders
//   D1  pipelined leaderboard writes still populate all/week/month
//   D8  Game.pgn is written instead of staying ""
//   E1  Game.openingEco / openingName are written too (Analysis increment 3)
//
// Run against a live stack: docker compose up -d, backend on :3100.
import { io } from "socket.io-client";

const API = "http://localhost:3100/api/v1";
const WS = "http://localhost:3100";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reg(u) {
  const body = { username: u, email: `${u}@t.test`, password: "Passw0rd!x", name: u.toUpperCase() };
  await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: "Passw0rd!x" }),
  });
  const j = await res.json();
  if (!j.accessToken) throw new Error(`auth ${u}: ${JSON.stringify(j)}`);
  return j;
}

const conn = (t) =>
  new Promise((res, rej) => {
    const s = io(WS, { auth: { token: `Bearer ${t}` }, transports: ["websocket"] });
    s.on("connect", () => res(s));
    s.on("connect_error", rej);
    setTimeout(() => rej(new Error("ws timeout")), 5000);
  });

const post = (path, token, body) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const sfx = Date.now().toString(36).slice(-4);
const alice = await reg(`hd_a_${sfx}`);
const bob = await reg(`hd_b_${sfx}`);
const eve = await reg(`hd_e_${sfx}`); // third party — never a player in any room

// ── A1: game history requires auth ──────────────────────────────────────────
{
  const anon = await fetch(`${API}/games/history/${alice.user.id}`);
  check("A1 history without a token → 401", anon.status === 401, `got ${anon.status}`);

  const authed = await fetch(`${API}/games/history/${alice.user.id}`, {
    headers: { Authorization: `Bearer ${alice.accessToken}` },
  });
  check("A1 history with a token → 200", authed.status === 200, `got ${authed.status}`);
}

// ── C3: player directory exists and leaks nothing ───────────────────────────
{
  const res = await fetch(`${API}/users?limit=5`);
  const body = await res.json();
  const rows = body.players ?? [];
  check("C3 GET /users → 200 with players[]", res.status === 200 && Array.isArray(rows), `status ${res.status}`);
  check("C3 rows carry id/username/rating", rows.length > 0 && "id" in rows[0] && "username" in rows[0] && "rating" in rows[0]);

  const serialized = JSON.stringify(body);
  check(
    "C3 no passwordHash / email in the payload",
    !serialized.includes("passwordHash") && !serialized.includes("@t.test"),
  );
}

// ── C2: the stats Profile renders ───────────────────────────────────────────
{
  const stats = await fetch(`${API}/users/${alice.user.username}/stats`).then((r) => r.json());
  check(
    "C2 stats returns ratings[] + totalGames",
    Array.isArray(stats.ratings) && typeof stats.totalGames === "number",
    JSON.stringify(stats).slice(0, 90),
  );
}

// ── Set up a real rated game (blitz 300s) ───────────────────────────────────
const aS = await conn(alice.accessToken);
const bS = await conn(bob.accessToken);
const eS = await conn(eve.accessToken);

const ch = await post("/matchmaking/challenge", alice.accessToken, {
  timeControl: 300,
  creatorColor: "white",
}).then((r) => r.json());
const acc = await post(`/matchmaking/challenge/${ch.token}/accept`, bob.accessToken).then((r) => r.json());
const roomId = acc.gameId;
check("setup: challenge accepted → room", !!roomId, roomId);

// ── A2: a non-player must not start the clock on a waiting room ─────────────
{
  let eveGotGameStart = false;
  eS.on("game_start", () => (eveGotGameStart = true));
  eS.emit("join_room", { roomId });
  await sleep(700);

  // The room is still 'waiting' — no player has joined yet. If Eve had flipped
  // it to 'active', white's clock would already be running against them.
  const before = await fetch(`${API}/games/${roomId}`).then((r) => r.status);
  check("A2 observer join did not broadcast game_start", !eveGotGameStart);
  // The room is Redis-only until it ends, so a 404 here just means "not
  // persisted yet" — the real assertion is that the clock never started, which
  // the timer check below covers.
  check("A2 room not persisted mid-game (expected)", before === 404 || before === 200, `status ${before}`);
}

// ── B5: gateway errors reach the client ─────────────────────────────────────
{
  let queueError = null;
  eS.on("error", (d) => (queueError = d));
  eS.emit("join_queue", { timeControl: 300, increment: 0 });
  await sleep(400);
  eS.emit("join_queue", { timeControl: 300, increment: 0 }); // same queue twice
  await sleep(600);
  check(
    "B5 duplicate join_queue emits error ALREADY_IN_QUEUE",
    queueError?.code === "ALREADY_IN_QUEUE",
    JSON.stringify(queueError),
  );
  eS.emit("leave_queue", { timeControl: 300 });
}

// ── Play the game out so persistence + leaderboard writes fire ──────────────
let over = null;
aS.on("game_over", (d) => (over = d));

// Now the real players join — this is what legitimately starts the clock.
aS.emit("join_room", { roomId });
bS.emit("join_room", { roomId });

let started = null;
aS.on("game_start", (d) => (started = d));
await sleep(800);
check(
  "A2 clocks start at full time when players join",
  started?.timers?.white === 300000 && started?.timers?.black === 300000,
  JSON.stringify(started?.timers),
);

// A couple of real moves so the PGN has content, then Bob resigns.
aS.emit("move", { roomId, from: "e2", to: "e4", promotion: "q" });
await sleep(400);
bS.emit("move", { roomId, from: "e7", to: "e5", promotion: "q" });
await sleep(400);
bS.emit("resign", { roomId });
for (let i = 0; i < 40 && !over; i++) await sleep(100);
check("setup: rated game ended", !!over, JSON.stringify(over?.result));
await sleep(500); // let saveCompletedGame + pipelined ZADDs settle

// ── D8: PGN is written ──────────────────────────────────────────────────────
{
  const history = await fetch(`${API}/games/history/${alice.user.id}?limit=1`, {
    headers: { Authorization: `Bearer ${alice.accessToken}` },
  }).then((r) => r.json());
  const game = history.games?.[0];
  const pgn = game?.pgn ?? "";
  check("D8 Game.pgn is non-empty", pgn.length > 0, pgn.slice(0, 60));
  check("D8 PGN contains the played moves", pgn.includes("e4") && pgn.includes("e5"), pgn.slice(0, 80));
  check("D8 PGN carries a Result tag", pgn.includes("[Result "), pgn.slice(0, 60));

  // E1: the third dead column. 1.e4 e5 is C20; the table degrades to the
  // shortest matching line rather than to nothing, so this is the real answer
  // for a two-move game, not a placeholder.
  check("E1 Game.openingEco is written", game?.openingEco === "C20", String(game?.openingEco));
  check("E1 Game.openingName is written", game?.openingName === "King's Pawn Game", String(game?.openingName));
  check("E1 PGN carries ECO and Opening tags",
    pgn.includes('[ECO "C20"]') && pgn.includes("[Opening "),
    (pgn.match(/\[(ECO|Opening) [^\]]*\]/g) || []).join(" "));
}

// ── D1: pipelined leaderboard writes still land on all three boards ─────────
{
  for (const period of ["all", "week", "month"]) {
    const board = await fetch(`${API}/leaderboard?variant=blitz&period=${period}&limit=100`).then((r) => r.json());
    const rows = Array.isArray(board) ? board : (board.players ?? board.entries ?? []);
    const ids = rows.map((r) => r.userId);
    check(
      `D1 ${period} board contains both players`,
      ids.includes(alice.user.id) && ids.includes(bob.user.id),
      `${rows.length} rows`,
    );
  }

  const rank = await fetch(
    `${API}/leaderboard/rank/${alice.user.id}?variant=blitz&period=week`,
  ).then((r) => r.json());
  check("D1 own-rank works on the week board", rank.rank !== null && rank.rating !== null, JSON.stringify(rank));
}

aS.close();
bS.close();
eS.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(" | "));
  process.exit(1);
}
process.exit(0);
