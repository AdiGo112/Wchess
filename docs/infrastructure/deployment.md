# Deployment

---

## Local Development

```bash
# Terminal 1: Databases
docker compose up -d

# Terminal 2: Backend
cd backend
npm run start:dev     # ts-node-dev with hot reload, port 3000

# Terminal 3: Frontend
cd frontend
npm run dev           # Vite, port 5173
```

---

## Production Build

### Backend
```bash
cd backend
npm run build         # tsc → dist/
npm run start:prod    # node dist/main.js
```

### Frontend
```bash
cd frontend
npm run build         # Vite → dist/
# Serve dist/ via nginx or CDN
```

---

## Recommended VPS Deployment (Phase 1)

Single server, all services co-located:

```
Ubuntu 22.04 VPS (8GB RAM, 4 vCPU)
├── Nginx (reverse proxy + SSL termination)
│   ├── api.chessweb.com  → localhost:3000  (NestJS)
│   └── chessweb.com      → /var/www/chess/ (React build)
├── NestJS API            → PM2 process manager
└── Docker Compose        → PostgreSQL, MongoDB, Redis
```

### Nginx config (api.chessweb.com)
```nginx
server {
    listen 443 ssl;
    server_name api.chessweb.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";   # required for WebSocket
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;                # long-poll / WS
    }
}
```

### PM2 (backend process manager)
```bash
npm install -g pm2
pm2 start dist/main.js --name chessweb-api
pm2 save
pm2 startup
```

---

## Managed Cloud (Phase 2+)

| Service | Provider | Notes |
|---|---|---|
| PostgreSQL | Supabase / Neon / RDS | Enable connection pooling (pgBouncer) |
| MongoDB | MongoDB Atlas | Free tier M0 for dev, M10+ for prod |
| Redis | Upstash / Redis Cloud | Upstash has per-request billing |
| NestJS API | Railway / Render / ECS | Horizontal scaling via Redis adapter |
| React Frontend | Vercel / Cloudflare Pages | CDN-distributed static assets |
| Stockfish Worker | Separate EC2 / ECS task | CPU-bound — isolate from API |

---

## Kubernetes (Phase 3 — Scale)

```yaml
Deployments:
  chessweb-api         → 3+ replicas, HPA on CPU
  chessweb-stockfish   → 2+ replicas, BullMQ concurrency

Services:
  ClusterIP for internal
  LoadBalancer for API (or Ingress)

Persistent volumes:
  Not needed — all state in managed databases
```

Socket.io horizontal scaling requires `@socket.io/redis-adapter` (already wired in `main.ts`). All replicas share the same Redis pub/sub channel — events propagate across pods.

---

## CI/CD (GitHub Actions — minimal)

```yaml
# .github/workflows/ci.yml
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: {...} }
      redis:    { image: redis:7 }
    steps:
      - uses: actions/checkout@v4
      - run: cd backend && npm ci && npm run test
  build:
    needs: test
    steps:
      - run: cd frontend && npm ci && npm run build
      - run: cd backend  && npm ci && npm run build
```

---

## Monitoring checklist (before go-live)

- [ ] Health endpoint: `GET /api/v1/health` → `{ status: "ok", db: "ok", redis: "ok" }`
- [ ] Uptime monitoring (BetterUptime / UptimeRobot)
- [ ] Error tracking (Sentry)
- [ ] Metrics (Prometheus + Grafana or Datadog)
- [ ] Log aggregation (Logtail / Papertrail)
- [ ] Daily PostgreSQL backups
- [ ] SSL certificate renewal (Certbot auto-renew)
