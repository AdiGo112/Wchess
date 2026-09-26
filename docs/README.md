# WChess — Documentation

Two kinds of document live here, and confusing them wastes an afternoon:

- **Live documents** describe the system as it is now. Trust them.
- **Frozen scaffolding** (`features/**`) describes the system as it was *planned*
  before the v1 scope cut (ADR-0032) and the 3000 → 3100 port move. Its curl
  examples, env var names and module lists are historical. Read it for intent,
  never for facts.

---

## Live documents

```
docs/
├── RESUME.md              — the exact state of the codebase + how to start it
├── CURRENT_SPRINT.md      — what is happening right now, updated every session
├── PROGRESS.md            — increment-level status across every feature
├── ALGORITHMS.md          — every algorithm used, with why / how / where
├── FUTURE_SCOPE.md        — what comes next, in three tiers of certainty
├── architecture/
│   ├── overview.md        — THE system design. Start here.
│   ├── api-reference.md   — every REST endpoint
│   ├── websocket-events.md— every Socket.io event, both directions
│   ├── database-schema.md — Prisma models + Redis keys
│   └── ADR-0032-*.md      — monolith now, socket split later
└── infrastructure/
    ├── ci-cd.md           — the pipeline and the branch workflow
    ├── docker-setup.md    — the local dev stack
    ├── environment.md     — every env var
    └── deployment.md      — the target production topology (not built yet)
```

Also live, at the repo root: **`../Diagrams.md`** — 16 Mermaid diagrams (C4
L1–L3, every flow, the ER diagram, the Redis keyspace, both deployment
topologies), each grounded in the real code.

## Frozen scaffolding

`features/NN-feature/` — twelve suites, each with `START_HERE.md`, `ARCHITECTURE.md`,
`DOMAIN_MODEL.md`, `API_DESIGN.md`, `WORKFLOWS.md`, its ADRs, a testing strategy,
and one implementation plan per increment. Five of the twelve (chat, notifications,
puzzles, tournaments, social) describe code that was deleted by ADR-0032 and will
come back as increments; see `FUTURE_SCOPE.md`.

The ADRs inside those folders are **not** frozen — a decision stays a decision.

---

## Branch strategy

```
feature/*  fix/*  chore/*  docs/*  →  dev  →  staging  →  main
```

Everything is cut from `dev` and merged back into `dev` with `--no-ff`. `staging`
and `main` move by merge only — never commit to them directly. The full rules,
the hotfix exception, and the CI job that enforces the order are in
`infrastructure/ci-cd.md`.

Earlier revisions of this file said feature branches are cut from `main` and
listed one branch per feature. Neither has been true since `dev` became the
integration branch.

---

## Reading order for a new session

1. `RESUME.md` — where the code actually is
2. `CURRENT_SPRINT.md` — what the last session was doing
3. `architecture/overview.md` — how the system is put together, and why
4. `../Diagrams.md` — the same thing, drawn
5. `architecture/api-reference.md` + `websocket-events.md` — the live contracts
6. `features/NN-*/START_HERE.md` — only for the feature you are about to touch
