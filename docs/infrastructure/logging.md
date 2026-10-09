# Logging

**Pino** via `nestjs-pino` (config: `backend/src/common/logging.ts`). Ship-plan item 0.13.

- **Dev:** one readable line per event (`pino-pretty`). Run the backend and watch the terminal.
- **Production** (`NODE_ENV=production`): one JSON object per line on stdout. Every host's
  log viewer can search it, and so can any log service (Better Stack, Grafana Loki, Axiom) [host].
- **Level:** `LOG_LEVEL` (default `debug` in dev, `info` in production). `debug` adds one
  line per move.

```
[20:43:55.090] INFO: game_started [GameGateway] {"roomId":"TMJ7C7","white":"spw_3vflh","black":"spb_3vflh","timeControl":"300+0","vsComputer":false}
[20:43:55.605] DEBUG: move [GameGateway] {"roomId":"TMJ7C7","ply":1,"san":"e4","thinkMs":520}
[20:43:55.615] WARN: move_rejected [GameGateway] {"roomId":"TMJ7C7","userId":"…","reason":"Not a player"}
[20:43:57.259] INFO: game_over [GameGateway] {"roomId":"TMJ7C7","result":"WHITE","reason":"RESIGNATION","plies":1,"durationMs":2177,"rated":true}
[20:43:57.720] WARN: login_failed [AuthService] {"username":"nobody_here","reason":"unknown_user"}
```

## What gets logged

**Every API request**: method, URL, status, response time, and a request id. The id is
returned to the client as the `x-request-id` header, and any event logged while
handling that request carries the same id. 4xx is `warn`, 5xx is `error`. Static SPA files
aren't logged.

**Events** (`event` field):

| Event | Level | Fields | Tells you |
|---|---|---|---|
| `user_registered` | info | userId | sign-ups |
| `login` | info | userId | active users |
| `login_failed` | **warn** | username, reason (`unknown_user` / `bad_password` / `banned`) | brute force: a burst for one username or IP |
| `refresh_refused` | **warn** | reason | replayed or stolen refresh token, expired session |
| `socket_connected` / `socket_disconnected` | info | userId | concurrent players |
| `socket_auth_failed` | **warn** | ip | bad or expired JWT on the socket |
| `queue_joined` | info | userId, rating, queue | demand per time control |
| `match_found` | info | roomId, queue, ratingGap, waitMs | matchmaking quality: wait time vs rating fairness |
| `challenge_accepted` | info | roomId, colors | friend games |
| `computer_game_created` | info | roomId, userId, difficulty | engine games |
| `game_started` | info | roomId, players, timeControl, vsComputer | games per minute |
| `move` | debug | roomId, ply, san, thinkMs | the game itself (dev only by default) |
| `move_rejected` | **warn** | roomId, userId, reason | a cheating attempt or a client bug |
| `game_over` | info | roomId, result, reason, plies, durationMs, rated | how games end, how long they last |

## Never logged

Passwords, tokens (access, refresh, **challenge share tokens**: URLs show `/challenge/:token`),
emails, auth headers, cookies, request and response bodies. Pino `redact` covers those field
names as a backstop. Before this change, the challenge-accepted log line printed the raw share
token; it no longer does.

Checked 2026-10-09: a full `verify-spectate` run plus a failed login produced zero matches for
bearer tokens, JWTs, passwords, test emails or 32-hex challenge tokens.

## Adding an event

```ts
this.logger.log({ event: 'thing_happened', roomId, userId }); // Nest Logger, any service
```

Keep `event` snake_case and past tense, and pass ids, not names or emails.
