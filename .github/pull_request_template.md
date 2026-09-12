## What

<!-- One paragraph. What changed and why. -->

## Verified

<!-- How you know it works. Live verification beats "builds clean". -->

- [ ] `backend`: `npm test` + `npm run build`
- [ ] `frontend`: `npm run build`
- [ ] Ran against the live stack (which script / which route)

## Docs

- [ ] `docs/CURRENT_SPRINT.md`, `docs/PROGRESS.md`, `docs/RESUME.md` updated
- [ ] Route / API / schema change → the matching file in `docs/architecture/` updated
- [ ] Architectural decision → an ADR in `docs/architecture/`

## Target

Promotion order is `feature/*` → `dev` → `staging` → `main`. CI rejects a PR that
skips a step (see `docs/infrastructure/ci-cd.md`).
