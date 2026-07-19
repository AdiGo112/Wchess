# ChessWeb — Documentation

This folder contains the full specification for every feature being built.
The master architecture reference lives at `../Here_is_THE_plan.md`.

## Structure

```
docs/
├── architecture/
│   ├── overview.md           — system diagram, service map
│   ├── database-schema.md    — Prisma schema, MongoDB schemas, Redis keys
│   ├── api-reference.md      — all REST endpoints across all services
│   └── websocket-events.md   — all Socket.io client↔server events
├── features/
│   ├── 01-auth.md
│   ├── 02-game-engine.md
│   ├── 03-matchmaking.md
│   ├── 04-stockfish.md
│   ├── 05-leaderboard.md
│   ├── 06-chat.md
│   ├── 07-tournaments.md
│   ├── 08-puzzles.md
│   ├── 09-social.md
│   ├── 10-notifications.md
│   ├── 11-analysis.md
│   └── 12-frontend-ui.md
└── infrastructure/
    ├── docker-setup.md       — running local dev stack
    ├── environment.md        — all env vars
    └── deployment.md         — Kubernetes + CI/CD
```

## Branch Strategy

Each feature gets its own branch off `main`:

```
main
├── feature/auth
├── feature/game-engine
├── feature/matchmaking
├── feature/stockfish
├── feature/leaderboard
├── feature/chat
├── feature/tournaments
├── feature/puzzles
├── feature/social
├── feature/notifications
├── feature/analysis
└── feature/frontend-ui
```

## Implementation Order

1. `feature/auth` — nothing else works without this
2. `feature/game-engine` — core product
3. `feature/matchmaking` — makes it multiplayer
4. `feature/stockfish` — computer opponent
5. `feature/leaderboard` — shows rankings
6. `feature/chat` — in-game communication
7. `feature/tournaments` — competitive play
8. `feature/puzzles` — tactics training
9. `feature/social` — friends & community
10. `feature/notifications` — alerts & emails
11. `feature/analysis` — post-game review
12. `feature/frontend-ui` — polish & UX
