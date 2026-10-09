// Runtime verification for ship-plan Phase 0 (security hardening):
//   H  /health reports Postgres + Redis
//   S  security headers on API responses (helmet)
//   V  unknown body fields are rejected (forbidNonWhitelisted), oversized bodies get 413
//   R  login is rate-limited per IP (AUTH_RATE_LIMIT, default 10/min)
//   P  malformed socket payloads are dropped without reaching a handler
//   F  a socket flooding events is disconnected
//
// Run against a live stack started with the DEFAULT auth limit (no AUTH_RATE_LIMIT):
//   docker compose up -d && cd backend && node dist/main
import { io } from "socket.io-client";

const API = "http://localhost:3100/api/v1";
const WS = "http://localhost:3100";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, body, headers = {}) =>
  fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

// ---------- H + S ----------
{
  const res = await fetch(`${API}/health`);
  const body = await res.json();
  check("H: /health is 200 with db and redis ok", res.status === 200 && body.db === "ok" && body.redis === "ok", JSON.stringify(body));
  check("S: Content-Security-Policy header", !!res.headers.get("content-security-policy"));
  check("S: X-Content-Type-Options nosniff", res.headers.get("x-content-type-options") === "nosniff");
  check("S: request id echoed", !!res.headers.get("x-request-id"));
}

// ---------- V ----------
{
  const res = await post("/auth/register", { username: "probe_user", email: "p@t.test", name: "P", password: "Passw0rd!x", role: "ADMIN" });
  const body = await res.json();
  check("V: unknown field is a 400", res.status === 400 && JSON.stringify(body).includes("role should not exist"), `${res.status}`);
  const big = await post("/auth/login", { username: "a".repeat(20_000), password: "x" });
  check("V: a 20 KB body is a 413", big.status === 413, `${big.status}`);
}

// ---------- P + F (one real user, logged in once) ----------
const suffix = Date.now().toString(36).slice(-5);
const username = `sec_${suffix}`;
await post("/auth/register", { username, email: `${username}@t.test`, name: username, password: "Passw0rd!x" });
const { accessToken } = await (await post("/auth/login", { username, password: "Passw0rd!x" })).json();
const connect = () => new Promise((resolve, reject) => {
  const s = io(WS, { auth: { token: `Bearer ${accessToken}` }, transports: ["websocket"], reconnection: false });
  s.on("connect", () => resolve(s));
  s.on("connect_error", reject);
});
{
  const s = await connect();
  const replies = [];
  s.onAny((event) => replies.push(event));
  // A well-formed but unknown room gets an answer; malformed payloads get none.
  s.emit("move", { roomId: "ZZZZZZ", from: "e2", to: "e4" });
  s.emit("move", { roomId: { $gt: "" }, from: "e2", to: "e4" });
  s.emit("move", { roomId: "ZZZZZZ", from: "e2", to: "z9" });
  s.emit("resign", "not-an-object");
  await sleep(800);
  check("P: well-formed payload still reaches the handler", replies.filter((e) => e === "invalid_move").length === 1, replies.join(","));
  check("P: malformed payloads are dropped, socket stays up", s.connected, `${replies.length} replies`);
  s.close();
}
{
  const s = await connect();
  const dropped = new Promise((r) => s.on("disconnect", () => r(true)));
  for (let i = 0; i < 60; i++) s.emit("offer_draw", { roomId: "ZZZZZZ" });
  const gone = await Promise.race([dropped, sleep(3000).then(() => false)]);
  check("F: 60 events in a burst gets the socket disconnected", gone === true);
}

// ---------- R (last: it burns this IP's login budget for a minute) ----------
{
  const codes = [];
  for (let i = 0; i < 12; i++) {
    codes.push((await post("/auth/login", { username: `nobody_${suffix}`, password: "wrong-pass" })).status);
  }
  const first429 = codes.indexOf(429);
  // 1 login above already counted; the limit is 10 per minute per IP.
  check("R: login is throttled after the per-minute limit", first429 >= 8 && first429 <= 10, codes.join(","));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
