# Environment Variables

---

## backend/.env (development)

```env
# ── Databases ───────────────────────────────────────
DATABASE_URL=postgresql://chess:chess123@localhost:5432/chessweb
MONGODB_URI=mongodb://localhost:27017/chessweb
REDIS_URL=redis://localhost:6379

# ── Auth ────────────────────────────────────────────
JWT_SECRET=chessweb-super-secret-jwt-key-change-this-in-production-64chars-min
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30

# ── Server ──────────────────────────────────────────
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# ── Email (optional — disable in dev) ───────────────
SENDGRID_API_KEY=
EMAIL_FROM=noreply@chessweb.com

# ── Stockfish ───────────────────────────────────────
STOCKFISH_BINARY_PATH=/usr/local/bin/stockfish
STOCKFISH_THREADS=1

# ── BullMQ ──────────────────────────────────────────
BULL_CONCURRENCY_STOCKFISH=2
BULL_CONCURRENCY_NOTIFICATIONS=5
BULL_CONCURRENCY_ANALYSIS=1
```

## backend/.env.example

Same file, with all secrets cleared:
```env
DATABASE_URL=postgresql://chess:chess123@localhost:5432/chessweb
MONGODB_URI=mongodb://localhost:27017/chessweb
REDIS_URL=redis://localhost:6379
JWT_SECRET=CHANGE_ME_64_CHARS_MIN
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SENDGRID_API_KEY=
EMAIL_FROM=noreply@chessweb.com
STOCKFISH_BINARY_PATH=/usr/local/bin/stockfish
```

---

## frontend/.env (development)

> Implemented 2026-07-19 as ONE origin-only var (not the API/WS pair originally
> planned): REST and WebSocket share the same backend origin, and `api.js`
> appends `/api/v1` itself. Optional in dev — defaults to localhost:3000.

```env
VITE_SERVER_URL=http://localhost:3000
```

## frontend/.env.example

```env
# Backend origin (no path). Local dev default is http://localhost:3000
VITE_SERVER_URL=http://localhost:3000
```

---

## Variable reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Prisma format) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_URL` | Yes | Redis connection URL |
| `JWT_SECRET` | Yes | HS256 signing secret — min 64 chars in production |
| `JWT_EXPIRES_IN` | Yes | Access token TTL (e.g., `15m`, `1h`) |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Yes | Refresh token lifetime in days |
| `PORT` | No | API server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `CORS_ORIGIN` | Yes | Allowed origin for CORS |
| `SENDGRID_API_KEY` | No | Required only for email notifications |
| `EMAIL_FROM` | No | Sender address for emails |
| `STOCKFISH_BINARY_PATH` | No | Path to native Stockfish binary (backend analysis) |
| `VITE_SERVER_URL` | No (frontend; defaults to `http://localhost:3000`) | Backend origin for both REST (`/api/v1` appended in `api.js`) and WebSocket |

---

## Production secrets checklist

- [ ] `JWT_SECRET` — generate with `openssl rand -hex 64`
- [ ] `DATABASE_URL` — use managed PostgreSQL (e.g., Supabase, RDS, Neon)
- [ ] `MONGODB_URI` — use MongoDB Atlas
- [ ] `REDIS_URL` — use Redis Cloud or Upstash
- [ ] `SENDGRID_API_KEY` — production SendGrid key
- [ ] Never commit `.env` to git — only `.env.example`
- [ ] Rotate `JWT_SECRET` if compromised — all existing tokens become invalid
