# Environment Variables

---

## backend/.env (development)

`backend/.env.example` is the source of truth — copy it and fill in `JWT_SECRET`.
Every variable below is read somewhere in `backend/src`; there are no others.

```env
# PostgreSQL — read by Prisma, not by application code
DATABASE_URL=postgresql://chess:chess123@localhost:5432/chessweb

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change-this-to-a-strong-random-secret-at-least-64-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30

# App
PORT=3100
NODE_ENV=development

# Allowed browser origin(s). One origin, or a comma-separated list.
# "*" reflects ANY origin back with credentials:true. Tunnel demos only;
# the server logs a [SECURITY] warning on boot when it is set.
CORS_ORIGIN=http://localhost:5173

# Host used to build friend-challenge share links.
# Falls back to CORS_ORIGIN, then http://localhost:5173.
FRONTEND_URL=http://localhost:5173
```

> Gone, and not coming back as-is: `MONGODB_URI` (Mongo left the stack
> 2026-07-19), `BULL_CONCURRENCY_*` (BullMQ went with ADR-0032 — the analysis
> queue is an in-process promise chain), `STOCKFISH_BINARY_PATH` (the engine is
> the WASM build out of `node_modules`, not a native binary on PATH), and
> `SENDGRID_API_KEY` / `EMAIL_FROM` (nothing sends email). Older revisions of
> this file listed all of them as required.

---

## frontend/.env (development)

> Implemented 2026-07-19 as ONE origin-only var (not the API/WS pair originally
> planned): REST and WebSocket share the same backend origin, and `api.js`
> appends `/api/v1` itself. Optional in dev — defaults to localhost:3100.

```env
VITE_SERVER_URL=http://localhost:3100
```

## frontend/.env.example

```env
# Backend origin (no path). Local dev default is http://localhost:3100
VITE_SERVER_URL=http://localhost:3100
```

---

## Variable reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Read by Prisma from the schema — never through `process.env` in app code. |
| `REDIS_URL` | Yes | Redis connection URL. |
| `JWT_SECRET` | Yes | HS256 signing secret — min 64 chars in production. |
| `JWT_EXPIRES_IN` | No (default `15m`) | Access token TTL. |
| `REFRESH_TOKEN_EXPIRES_DAYS` | No (default `30`) | Refresh token lifetime in days. |
| `PORT` | No (default `3100`) | API server port. |
| `NODE_ENV` | No | `development` or `production`. |
| `CORS_ORIGIN` | No (default `http://localhost:5173`) | Allowed browser origin(s). `*` = reflect any origin (demo/tunnel only); comma-separated = allow-list. Parsed by `common/utils/cors.ts`, applied to REST in `main.ts` and to both socket gateways. |
| `FRONTEND_URL` | No | Origin used to build friend-challenge share links. Falls back to `CORS_ORIGIN`, then `http://localhost:5173`. |
| `VITE_SERVER_URL` | No (frontend) | Absolute backend origin. **Unset = same-origin**: the frontend calls `/api/v1` and `/socket.io` on its own origin, which the Vite dev proxy (or a prod reverse proxy) forwards. Set it only to bypass the proxy. |
| `VITE_PROXY_TARGET` | No (frontend, dev only) | Where `vite.config.js` points its `/api` + `/socket.io` proxy. Defaults to `http://localhost:3100`. Build-time only — it never reaches the browser. |

---

## Sharing a live demo without deploying (build once, tunnel one port)

**Do NOT tunnel the Vite dev server** — its hot-reload WebSocket and hundreds of
on-demand module requests make tunnels return 502s and `wss://localhost:undefined`
errors. Instead, build the frontend once and let the **backend serve it**
(`ServeStaticModule` in `app.module.ts` serves `frontend/dist`, with `/api` + `/socket.io`
excluded so they still route to Nest). Now it's one real server on one port — exactly
what a tunnel handles well.

```bash
docker compose up -d                 # postgres + redis
cd frontend && npm run build         # produces frontend/dist (rebuild after UI changes)

# set CORS_ORIGIN=* in backend/.env (the socket handshake carries the tunnel's
# random per-session origin), then:
cd backend && npm run start:dev      # :3100 now serves app + API + WebSocket

# expose ONLY port 3100:
cloudflared tunnel --url http://localhost:3100     # no account; prints an https URL
#   or:  npx localtunnel --port 3100
```

Share the printed `https://…` URL — your friend gets the whole app from your machine.
Your laptop must stay awake/running (the app lives on it; the tunnel only forwards).
Revert `CORS_ORIGIN` when done.

> Normal local dev is unchanged: run Vite on `:5173` (`npm run dev`) — its proxy forwards
> `/api` + `/socket.io` to `:3100`. The backend's static serving of `dist` only matters
> for this demo/prod single-port mode.

**Same-Wi-Fi alternative (no tunnel):** after `npm run build`, run the backend and share
`http://<your-LAN-ip>:3100` (find it with `ipconfig`); open the firewall for 3100. Same
one-port model, no tunnel.

---

## Production secrets checklist

- [ ] `JWT_SECRET` — generate with `openssl rand -hex 64`
- [ ] `DATABASE_URL` — use managed PostgreSQL (e.g., Supabase, RDS, Neon)
- [ ] `REDIS_URL` — use Redis Cloud or Upstash
- [ ] Never commit `.env` to git — only `.env.example`
- [ ] Rotate `JWT_SECRET` if compromised — all existing tokens become invalid
