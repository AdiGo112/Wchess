// Runtime verification for ship-plan Phase 0 (security hardening):
//   H  /health reports Postgres + Redis
//   S  security headers on API responses (helmet)
//   V  unknown body fields are rejected (forbidNonWhitelisted), oversized bodies get 413,
//      malformed JSON gets 400
//   R  login is rate-limited per IP (AUTH_RATE_LIMIT, default 10/min)
//   P  malformed socket payloads are dropped without reaching a handler
//   F  a socket flooding events is disconnected
//   A  deny by default: private routes 401 without a token, @Public() ones don't (ship-plan 1.2)
//   I  a stranger's public profile carries no private columns (ship-plan 1.3)
//   C  the refresh token is an HttpOnly SameSite=Strict cookie, never in a body; it rotates and logout kills it (1.1)
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
  // Both used to come back as a misleading 404 on NestJS 11 (serve-static rewrote parser errors).
  const broken = await post("/auth/login", '{"username": broken');
  check("V: malformed JSON is a 400", broken.status === 400, `${broken.status}`);
}

// ---------- A ----------
{
  const priv = [
    ["GET", "/auth/me"], ["PATCH", "/users/me"], ["GET", "/games/live"], ["GET", "/games/history/x"],
    ["POST", "/analysis/x"], ["POST", "/matchmaking/computer"], ["GET", "/matchmaking/queue-status"],
  ];
  const pub = ["/leaderboard", "/users", "/users/nobody_here", "/games/nope", "/analysis/nope"];
  const privCodes = await Promise.all(priv.map(([method, p]) => fetch(`${API}${p}`, { method }).then((r) => r.status)));
  check("A: every private route is 401 without a token", privCodes.every((c) => c === 401), privCodes.join(","));
  const pubCodes = await Promise.all(pub.map((p) => fetch(`${API}${p}`).then((r) => r.status)));
  check("A: public routes answer without a token", pubCodes.every((c) => c !== 401), pubCodes.join(","));
}

// ---------- P + F (one real user, logged in once) ----------
const suffix = Date.now().toString(36).slice(-5);
const username = `sec_${suffix}`;
await post("/auth/register", { username, email: `${username}@t.test`, name: username, password: "Passw0rd!x" });
const { accessToken } = await (await post("/auth/login", { username, password: "Passw0rd!x" })).json();

// ---------- C ----------
{
  const login = await post("/auth/login", { username, password: "Passw0rd!x" });
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith("rt=")) ?? "";
  const body = await login.json();
  check("C: login sets an HttpOnly, SameSite=Strict, /auth-scoped cookie", /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie) && cookie.includes("Path=/api/v1/auth"), cookie.replace(/rt=[^;]+/, "rt=…"));
  check("C: no refresh token in the login body", !("refreshToken" in body) && !!body.accessToken);
  const rt = cookie.split(";")[0];
  const refreshed = await post("/auth/refresh", {}, { Cookie: rt });
  const rt2 = (refreshed.headers.getSetCookie().find((c) => c.startsWith("rt=")) ?? "").split(";")[0];
  const rBody = await refreshed.json();
  check("C: refresh with the cookie rotates it", refreshed.status === 200 && !!rBody.accessToken && !("refreshToken" in rBody) && rt2 && rt2 !== rt, `${refreshed.status}`);
  check("C: the rotated-out cookie is refused", (await post("/auth/refresh", {}, { Cookie: rt })).status === 401);
  check("C: refresh without a cookie is a quiet 204 (logged-out visitor)", (await post("/auth/refresh", {})).status === 204);
  const out = await post("/auth/logout", {}, { Cookie: rt2 });
  check("C: logout clears the cookie and revokes it", out.status === 204 && out.headers.getSetCookie().some((c) => /^rt=;/.test(c)) && (await post("/auth/refresh", {}, { Cookie: rt2 })).status === 401);
}

// ---------- I ----------
{
  const profile = await (await fetch(`${API}/users/${username}`)).json();
  const leaked = ["email", "passwordHash", "oauthId", "role", "isBanned", "emailVerified", "lastSeenAt"].filter((k) => k in profile);
  check("I: public profile has no private columns", profile.username === username && leaked.length === 0, leaked.join(","));
}
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
  // 2 logins above (P+F, C) already counted; the limit is 10 per minute per IP.
  check("R: login is throttled after the per-minute limit", first429 === 8, codes.join(","));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
