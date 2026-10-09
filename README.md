# WChess

Real-time multiplayer chess with server-side clocks, Glicko-2 ratings and Stockfish game analysis.

**Stack:** React + TypeScript, NestJS, PostgreSQL (Prisma), Redis, Socket.io, Stockfish (WASM)

## Features

- Quick match with rating-based pairing, friend challenge links, and games against the computer (5 levels)
- Server-authoritative clocks: flag-fall is decided on the server and survives a restart
- Glicko-2 ratings per time control (bullet, blitz, rapid, classical)
- Leaderboards: all-time, weekly and monthly
- Post-game analysis: per-move verdicts, accuracy, best moves, opening name
- Spectate live games
- Structured logging (Pino) with request ids

## Getting started

Requires Node 20+ and Docker.

```bash
docker compose up -d              # Postgres :5432, Redis :6379

cd backend
cp .env.example .env              # set JWT_SECRET
npm install
npx prisma migrate dev
npm run start:dev                 # http://localhost:3100 (API docs at /api/docs)

cd ../frontend
npm install
npm run dev                       # http://localhost:5173
```

To serve everything from one port, run `npm run build` in `frontend/`; the backend then serves the built app on `:3100`.

## Tests

```bash
cd backend && npm test && npm run lint     # Jest unit tests + ESLint
cd frontend && npm test                    # Vitest
```

End-to-end checks run against a live stack: `frontend/scripts/verify-*.mjs` and `backend/scripts/verify-*.mjs`.

## Docs

- `docs/architecture/overview.md`: system design
- `docs/architecture/api-reference.md` and `websocket-events.md`: API contracts
- `docs/RESUME.md`: getting set up again after a break
- `docs/infrastructure/ship-plan.md` and `docs/architecture/performance-plan.md`: what's next

## Branches

`feature/*` → `dev` → `staging` → `main`. Don't commit directly to `staging` or `main`.
