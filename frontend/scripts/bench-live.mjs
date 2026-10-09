// Live-play cost benchmark (performance-plan.md, Phase 0 "live" + Phase 7).
//
// Measures, against a running stack (docker compose up -d, backend on :3100):
//   1. idle    — Redis commands per minute with no game in progress
//   2. waiting — Redis commands + socket messages per minute per active game
//                while nobody moves (players thinking)
//   3. moves   — Redis commands and socket messages per move, and move
//                round-trip latency (emit → own move_made), p50 / p99
//
// Lives in frontend/scripts only because socket.io-client is installed here.
// Usage: node scripts/bench-live.mjs <label>   → ../bench/results/live-<label>.json
import { io } from "socket.io-client";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";

const API = "http://localhost:3100/api/v1";
const WS = "http://localhost:3100";
const label = process.argv[2] || "run";
const WINDOW_MS = 30_000;
const GAMES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const within = (promise, ms, what) =>
  Promise.race([promise, sleep(ms).then(() => { throw new Error(`timed out: ${what}`); })]);
const log = (msg) => console.error(`[bench] ${msg}`);

const redis = (cmd) => execSync(`docker exec chessweb_redis redis-cli ${cmd}`).toString();
/** Total commands executed by Redis since the last RESETSTAT. */
const redisCalls = () =>
  [...redis("INFO commandstats").matchAll(/calls=(\d+)/g)].reduce((n, m) => n + Number(m[1]), 0);
const resetStats = () => redis("CONFIG RESETSTAT");

async function login(username) {
  const body = { username, email: `${username}@t.test`, password: "Passw0rd!x", name: username };
  await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "Passw0rd!x" }),
  });
  return res.json();
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: `Bearer ${token}` }, transports: ["websocket"] });
    s.received = 0;
    s.onAny(() => s.received++);
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("ws connect timeout")), 5000);
  });
}

async function startGame(a, b, sa, sb) {
  const { token } = await fetch(`${API}/matchmaking/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.accessToken}` },
    body: JSON.stringify({ timeControl: 600, creatorColor: "white" }),
  }).then((r) => r.json());
  const { gameId } = await fetch(`${API}/matchmaking/challenge/${token}/accept`, {
    method: "POST", headers: { Authorization: `Bearer ${b.accessToken}` },
  }).then((r) => r.json());
  const started = new Promise((r) => sa.once("game_start", r));
  sa.emit("join_room", { roomId: gameId });
  sb.emit("join_room", { roomId: gameId });
  await within(started, 5000, `game_start for ${gameId}`);
  return gameId;
}

const suffix = Date.now().toString(36).slice(-5);
const players = [];
for (let i = 0; i < GAMES; i++) {
  const w = await login(`bw${i}_${suffix}`);
  const b = await login(`bb${i}_${suffix}`);
  players.push({ w, b, sw: await connect(w.accessToken), sb: await connect(b.accessToken) });
}

log("players connected");
const live = Number(redis("ZCARD clock:deadlines").trim());
if (live > 0) {
  console.error(`[bench] ${live} game(s) already running — idle would not be idle. Finish them first.`);
  process.exit(1);
}
// 1. idle: sockets connected, no game running.
await sleep(2_000);
resetStats();
await sleep(WINDOW_MS);
const idlePerMin = (redisCalls() * 60_000) / WINDOW_MS;

log("idle window done");
// 2. waiting: GAMES games in progress, nobody moves.
const rooms = [];
for (const p of players) rooms.push(await startGame(p.w, p.b, p.sw, p.sb));
await sleep(2_000);
for (const p of players) { p.sw.received = 0; p.sb.received = 0; }
resetStats();
await sleep(WINDOW_MS);
const waitingCalls = redisCalls();
const waitingMsgs = players.reduce((n, p) => n + p.sw.received + p.sb.received, 0);
const perGamePerMin = (x) => (x * 60_000) / WINDOW_MS / GAMES;

log("waiting window done");
// 3. moves: one game plays a fixed 20-ply line; measure each round trip.
const LINE = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7",
  "f1e1", "b7b5", "a4b3", "d7d6", "c2c3", "e8g8", "h2h3", "c6b8", "d2d4", "b8d7"];
const { sw, sb } = players[0];
const roomId = rooms[0];
const latencies = [];
sw.received = 0; sb.received = 0;
resetStats();
for (let i = 0; i < LINE.length; i++) {
  const mover = i % 2 === 0 ? sw : sb;
  const uci = LINE[i];
  // Both sockets get every move_made; match on moveIndex, or a late copy of
  // the previous ply resolves this wait early and the turn order drifts.
  const seen = (s) => new Promise((resolve, reject) => {
    const onMove = (d) => { if (d.move.moveIndex === i) { s.off("move_made", onMove); resolve(); } };
    s.on("move_made", onMove);
    s.once("invalid_move", (d) => reject(new Error(`ply ${i} (${uci}) rejected: ${d.reason}`)));
  });
  const t0 = performance.now();
  const echoed = seen(mover);
  const other = seen(mover === sw ? sb : sw);
  mover.emit("move", { roomId, from: uci.slice(0, 2), to: uci.slice(2, 4) });
  await within(echoed, 5000, `move_made for ply ${i} (${uci})`);
  latencies.push(performance.now() - t0);
  await within(other, 5000, `opponent copy of ply ${i}`);
  mover.removeAllListeners("invalid_move");
}
const moveCalls = redisCalls();
const moveMsgs = sw.received + sb.received;
latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))];

// Resign every bench game so the next run (and real users) start clean.
for (let g = 0; g < rooms.length; g++) players[g].sw.emit("resign", { roomId: rooms[g] });
await sleep(1_000);
for (const p of players) { p.sw.close(); p.sb.close(); }

const result = {
  label,
  at: new Date().toISOString(),
  idle: { redisCommandsPerMin: Math.round(idlePerMin) },
  waiting: {
    games: GAMES,
    redisCommandsPerGamePerMin: Math.round(perGamePerMin(waitingCalls)),
    socketMessagesPerGamePerMin: Math.round(perGamePerMin(waitingMsgs)),
  },
  moves: {
    plies: LINE.length,
    redisCommandsPerMove: +(moveCalls / LINE.length).toFixed(1),
    socketMessagesPerMove: +(moveMsgs / LINE.length).toFixed(1),
    latencyMs: { p50: +pct(50).toFixed(1), p99: +pct(99).toFixed(1) },
  },
};
console.log(JSON.stringify(result, null, 2));
mkdirSync("../bench/results", { recursive: true });
writeFileSync(`../bench/results/live-${label}.json`, JSON.stringify(result, null, 2) + "\n");
process.exit(0);
