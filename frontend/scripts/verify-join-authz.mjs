// Runtime verification for fix/join-room-authz.
// Two scenarios run in parallel (each needs a ~60s abandonment window):
//  A. EXPLOIT (must be dead): a non-player joins an active game and disconnects.
//     The real black player must NOT lose — no game_over within 65s.
//  B. CONTROL (must still work): a real player disconnects → game ends ABANDONED
//     after ~60s, so we know the fix didn't break legitimate abandonment.
import { io } from "socket.io-client";

const API = "http://localhost:3100/api/v1";
const WS = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reg(username) {
  const body = { username, email: `${username}@t.test`, password: "Passw0rd!x", name: username };
  await fetch(`${API}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "Passw0rd!x" }) });
  const j = await res.json();
  if (!j.accessToken) throw new Error(`auth failed ${username}: ${JSON.stringify(j)}`);
  return j;
}
function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(WS, { auth: { token: `Bearer ${token}` }, transports: ["websocket"] });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("ws timeout")), 5000);
  });
}
async function game(a, b, tc = 600) {
  const res = await fetch(`${API}/matchmaking/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a.accessToken}` },
    body: JSON.stringify({ variant: "rapid", timeControl: tc, creatorColor: "white" }),
  });
  const { token } = await res.json();
  const acc = await fetch(`${API}/matchmaking/challenge/${token}/accept`, { method: "POST", headers: { Authorization: `Bearer ${b.accessToken}` } });
  const j = await acc.json();
  if (!j.gameId) throw new Error(`accept failed: ${JSON.stringify(j)}`);
  return j.gameId; // a=white, b=black
}

const sfx = Date.now().toString(36).slice(-4);
const alice = await reg(`al_${sfx}`);
const bob = await reg(`bo_${sfx}`);
const eve = await reg(`ev_${sfx}`);

// ---------- A: EXPLOIT — non-player join + disconnect must NOT end the game ----------
async function scenarioExploit() {
  const aS = await connect(alice.accessToken);
  const bS = await connect(bob.accessToken);
  const roomId = await game(alice, bob, 600); // 10min so clocks never flag during the test
  let over = null;
  aS.on("game_over", (d) => { if (d.roomId === roomId) over = d; });
  aS.emit("join_room", { roomId });
  bS.emit("join_room", { roomId });
  await sleep(500);

  // Eve (non-player) joins then disconnects — the attack.
  const eS = await connect(eve.accessToken);
  eS.emit("join_room", { roomId });
  await sleep(500);
  eS.close(); // disconnect: pre-fix this armed a 60s black-abandonment timer

  await sleep(64_000); // past the 60s grace
  check("A: exploit dead — non-player disconnect does NOT end the game", over === null,
    over ? `LEAKED game_over result=${over.result} reason=${over.reason}` : "room untouched after 64s");
  aS.close(); bS.close();
  return roomId;
}

// ---------- B: CONTROL — real player disconnect still ends the game ----------
async function scenarioControl() {
  const aS = await connect(alice.accessToken);
  const bS = await connect(bob.accessToken);
  const roomId = await game(alice, bob, 600);
  let over = null;
  aS.on("game_over", (d) => { if (d.roomId === roomId) over = d; });
  aS.emit("join_room", { roomId });
  bS.emit("join_room", { roomId });
  await sleep(500);

  bS.close(); // the REAL black player disconnects
  await sleep(64_000);
  check("B: control — real black player's disconnect still abandons (white wins)",
    over?.result === "white" && over?.reason === "abandoned",
    JSON.stringify({ result: over?.result, reason: over?.reason }));
  aS.close();
}

await Promise.all([scenarioExploit(), scenarioControl()]);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
