// Runtime verification for feature/leaderboard-polish (increments 2 + 3).
// Plays one rated blitz game so updateScore fires on all three period boards,
// then asserts: all/week/month boards contain both players with correct
// win/loss ratings; own-rank endpoint works per period; period buckets exist
// in Redis; invalid period falls back to all-time.
import { io } from "socket.io-client";
import { execSync } from "child_process";

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
  await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: "Passw0rd!x" }) });
  const j = await res.json();
  if (!j.accessToken) throw new Error(`auth ${u}: ${JSON.stringify(j)}`);
  return j;
}
const conn = (t) => new Promise((res, rej) => {
  const s = io(WS, { auth: { token: `Bearer ${t}` }, transports: ["websocket"] });
  s.on("connect", () => res(s));
  s.on("connect_error", rej);
  setTimeout(() => rej(new Error("ws timeout")), 5000);
});
const get = (path, token) =>
  fetch(`${API}${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined).then((r) => r.json());

const sfx = Date.now().toString(36).slice(-4);
const alice = await reg(`lb_a_${sfx}`);
const bob = await reg(`lb_b_${sfx}`);
const aId = alice.user.id, bId = bob.user.id;

// Play a rated blitz (300s) game; Bob resigns → Alice wins → both boards updated.
const aS = await conn(alice.accessToken);
const bS = await conn(bob.accessToken);
const ch = await fetch(`${API}/matchmaking/challenge`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice.accessToken}` },
  body: JSON.stringify({ variant: "blitz", timeControl: 300, creatorColor: "white" }),
}).then((r) => r.json());
const acc = await fetch(`${API}/matchmaking/challenge/${ch.token}/accept`, { method: "POST", headers: { Authorization: `Bearer ${bob.accessToken}` } }).then((r) => r.json());
const roomId = acc.gameId;
let over = false;
aS.on("game_over", () => (over = true));
aS.emit("join_room", { roomId });
bS.emit("join_room", { roomId });
await sleep(600);
bS.emit("resign", { roomId });
for (let i = 0; i < 30 && !over; i++) await sleep(100);
check("setup: rated game ended", over);
await sleep(400); // let the saveCompletedGame tx + ZADDs settle

// Flush only the leaderboard read-cache so the just-played game reflects now
// (the 60s cache is real production behavior; we bypass it for a deterministic
// assertion, not because it's wrong).
try {
  execSync(`docker exec chessweb_redis sh -c "redis-cli --scan --pattern 'cache:leaderboard:*' | xargs -r redis-cli del"`, { stdio: "ignore" });
} catch { /* ignore */ }

const find = (rows, id) => rows.find((r) => r.userId === id);

for (const period of ["all", "week", "month"]) {
  const rows = await get(`/leaderboard?variant=blitz&period=${period}&limit=100`);
  const a = find(rows, aId), b = find(rows, bId);
  check(`${period}: both players on the board`, !!a && !!b,
    a && b ? `alice=${a.rating} bob=${b.rating}` : "missing");
  check(`${period}: winner rated above loser & baseline`, !!a && !!b && a.rating > b.rating && a.rating > 1200 && b.rating < 1200,
    a && b ? `alice=${a.rating} > bob=${b.rating}` : "n/a");
  check(`${period}: ranks are 1-based ascending`, !!a && Number.isInteger(a.rank) && a.rank >= 1);
}

// Own-rank endpoint per period
for (const period of ["all", "week"]) {
  const rk = await get(`/leaderboard/rank/${aId}?variant=blitz&period=${period}`, alice.accessToken);
  check(`rank/${period}: alice has a numeric rank + rating`, Number.isInteger(rk.rank) && rk.rank >= 1 && typeof rk.rating === "number",
    JSON.stringify(rk));
}

// A player with no games in this variant → rank null (drives the "unrated" UI row)
const unrankedVariant = await get(`/leaderboard/rank/${aId}?variant=bullet&period=all`, alice.accessToken);
check("rank: unplayed variant returns null rank", unrankedVariant.rank === null, JSON.stringify(unrankedVariant));

// Redis period buckets exist with the documented key shape
const keys = execSync(`docker exec chessweb_redis redis-cli KEYS "leaderboard:*:blitz"`).toString();
check("redis: week bucket key exists", /leaderboard:week:\d{4}-W\d{2}:blitz/.test(keys), keys.trim().split("\n").join(" "));
check("redis: month bucket key exists", /leaderboard:month:\d{4}-\d{2}:blitz/.test(keys));

// Invalid period defensively falls back to all-time (same membership as all)
const garbage = await get(`/leaderboard?variant=blitz&period=nonsense&limit=100`);
check("invalid period falls back to all-time", !!find(garbage, aId));

aS.close(); bS.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
