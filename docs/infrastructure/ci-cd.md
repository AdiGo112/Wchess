# CI/CD — Pipeline & Branch Workflow

> The pipeline lives in `.github/workflows/ci.yml`. This file explains what it
> checks, what it deliberately does not, and the branch order it enforces.

---

## 1 · The branch workflow

```
feature/*  fix/*  chore/*  docs/*
        │
        │  PR (CI: backend + frontend)
        ▼
      dev ──────────── integration branch. Everything lands here first.
        │
        │  PR (CI: backend + frontend + promotion order)
        ▼
    staging ────────── release candidate. Only `dev` may open this PR.
        │
        │  PR (CI: backend + frontend + promotion order)
        ▼
      main ─────────── what is deployed. Only `staging` or `hotfix/*`.
```

**Never commit directly to `main` or `staging`.** They move by merge only.

| Branch | Cut from | Merges into | Naming |
|---|---|---|---|
| Feature | `dev` | `dev` | `feature/<slug>` — one increment, e.g. `feature/stockfish-inc2` |
| Fix | `dev` | `dev` | `fix/<slug>` — a defect on already-merged work |
| Chore / Docs | `dev` | `dev` | `chore/<slug>`, `docs/<slug>` — no product behaviour change |
| Hotfix | `main` | `main` **and** `dev` | `hotfix/<slug>` — production is broken, `staging` is not clean |

A hotfix is the only branch allowed to skip `dev` and `staging`, and it is not
finished until it is also merged back into `dev` — otherwise the next promotion
silently reverts it.

### Merge style

`--no-ff`, always. The merge commit is the increment boundary in the history,
and `docs/CURRENT_SPRINT.md` cites those SHAs. A fast-forward erases them.

```bash
git checkout dev
git merge --no-ff feature/eco-openings -m "merge(feature): ECO opening naming (Analysis Inc 3) into dev"
```

---

## 2 · The pipeline

Triggers: every push to `dev` / `staging` / `main`, and every PR targeting them.
In-flight runs for the same ref are cancelled when a new commit arrives.

### Job: `backend`

| Step | Why it is there |
|---|---|
| `npm ci` | Lockfile-exact install. Fails if `package.json` and the lockfile disagree. |
| `npx prisma generate` | `@prisma/client` types are generated, not committed — nothing typechecks without this. |
| `npm test` | Jest: `classify.spec.ts` (move classification + accuracy) and `openings.spec.ts` (ECO matcher). 20 tests. |
| `npm run build` | `nest build` — this is the typecheck. It fails on any type error, so a separate `tsc --noEmit` step would be the same work twice. |

`DATABASE_URL` is set to the local-dev value as a job env var. Prisma needs to
*resolve* `env("DATABASE_URL")` to parse the schema; nothing in this job opens a
connection. No Postgres or Redis service container runs — both suites are pure
units. Add the services the day an e2e test needs them, not before.

### Job: `frontend`

| Step | Why it is there |
|---|---|
| `npm ci` | As above. |
| `npm run build` | Three things in one script: `prebuild` copies the Stockfish engine out of `node_modules` into `public/engine/` (which is gitignored, so CI must generate it), then `tsc --noEmit`, then `vite build`. |

### Job: `promotion`

PR-only. Rejects a PR whose head/base pair breaks the order above: `main`
accepts only `staging` or `hotfix/*`, `staging` accepts only `dev`, and `dev`
accepts anything. Branch names arrive through `env:`, never interpolated into
the shell, because a fork can name a branch anything.

This job reports status but cannot block a merge on its own — see §5 for the
branch protection that makes it binding, and `.github/setup-branch-protection.sh`
to apply it.

### Node version

Pinned to `24`, matching the development machine. The README's "Node 20+" is the
floor for running the app, not a version CI has ever exercised.

---

## 3 · What is deliberately *not* in the pipeline

| Not run | Why |
|---|---|
| Lint | `backend` has no ESLint config at all (ESLint 9 needs a flat `eslint.config.js`), and `frontend/eslint.config.js` only matches `**/*.{js,jsx}` — every source file has been `.ts`/`.tsx` since the TS migration, so it lints nothing. The scripts are decorative. Wire a real config first; a green lint job over zero files is worse than no job. |
| `verify-*.mjs` scripts | They drive a live stack: Postgres, Redis, a booted Nest server, real sockets, real logins. That is a deployment, not a check. They stay a manual pre-merge gate — see the PR template. |
| Deploy | There is no hosted environment yet. `staging` and `main` are branches, not servers. `docs/infrastructure/deployment.md` describes the target topology; when it exists, it becomes a fourth job gated on `main`. |
| Docker image build | Nothing consumes one. `docker-compose.yml` is Postgres + Redis for local dev only; the app runs on the host. |

---

## 4 · Running the same checks locally

```bash
cd backend  && npm ci && npx prisma generate && npm test && npm run build
cd frontend && npm ci && npm run build
```

That is the whole pipeline. If it passes locally it passes in CI — there is no
step that only exists on the runner.

---

## 5 · Branch protection

The pipeline reports status; it cannot block a merge on its own. Until the rules
below are on, the `promotion` job is **advisory** — a red X the author can merge
straight past.

Run the wizard:

```bash
bash .github/setup-branch-protection.sh
```

Five stages. It applies the settings through `gh api` if the GitHub CLI is
authenticated, and walks you through the web UI if it is not — offering
`gh auth login` in between. It reads the three check names out of the workflow
rather than restating them, so they cannot drift apart.

What it sets, on both `main` and `staging`:

| Setting | Value |
|---|---|
| Require a pull request before merging | on, **0 required approvals** |
| Require status checks to pass | `backend — test + build`, `frontend — typecheck + build`, `branch promotion order` |
| Require branches to be up to date | on |
| Force pushes / deletions | off |
| Enforce on admins | off by default — the wizard asks |

**Why 0 required approvals.** A PR is still mandatory, but this is a one-person
project: a rule that demands someone *else* approve means nothing ever merges.
Raise it the day there is a second developer.

**Why admins are exempt by default.** Enforced-on-admins means a broken pipeline
can lock you out of your own `main` until it goes green. The rules are there to
stop an absent-minded merge, not to take away the keys. The wizard offers the
strict setting if you want it.

### Two things to know before running it

**The `branch promotion order` check will not be in GitHub's picker yet.** That
job is PR-only (`if: github.event_name == 'pull_request'`), so pushing to `dev`
never triggers it, and GitHub only suggests checks it has seen report recently.
Type the name by hand, or add it after the first PR. The wizard says so at the
point it matters.

**Classic branch protection may not be available.** On some private-repo plans
the `branches/*/protection` API is refused; Rulesets (Settings → Rules) are the
route there instead. The wizard names this as the first thing to check if the
API call fails.

### Proving it works

Open a PR that *should* be rejected:

```bash
git push origin dev:refs/heads/tmp-promotion-check
gh pr create --base main --head tmp-promotion-check --fill
# expect: "branch promotion order" fails, merge blocked
git push origin --delete tmp-promotion-check
```

A guard nobody has watched fail is a guard nobody knows the shape of.
