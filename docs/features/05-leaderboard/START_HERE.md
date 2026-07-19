# Feature 05 — Leaderboard: Start Here

This document is your entry point. Read files in the order below to build a complete mental model before touching any code.

## Reading Order

1. **README.md** — Feature goals, user stories, and output artifacts
2. **DOMAIN_MODEL.md** — Data structures, Redis key schema, and business rules
3. **ARCHITECTURE.md** — Service map, file tree, Redis sorted set design
4. **API_DESIGN.md** — Endpoint table, request/response shapes, error codes
5. **WORKFLOWS.md** — Step-by-step data flows for each major operation
6. **ADR-0011-redis-sorted-sets.md** — Why Redis sorted sets for rank storage
7. **ADR-0012-glicko2-rating-system.md** — Why Glicko-2 over plain ELO
8. **DELIVERY_NOTES.md** — Acceptance criteria and known limitations
9. **AUTOMATED_TESTING_STRATEGY.md** — What to test and at which layer
10. **AUTOMATED_TESTING_PROMPT.md** — Copy-paste prompt to generate tests
11. **DASHBOARDS.md** — UI views exposed to users and their data sources
12. **IMPLEMENTATION_PROMPT_BACKEND.md** — Full backend implementation prompt
13. **IMPLEMENTATION_PROMPT_FRONTEND.md** — Full frontend implementation prompt

### Incremental Delivery

| File | Purpose |
|------|---------|
| IMPLEMENTATION_PLAN_INCREMENT_1.md | Backend Redis: ZADD, ZREVRANGE, ZREVRANK, enrichment |
| IMPLEMENTATION_PLAN_INCREMENT_2.md | Backend time-scoped boards: weekly/monthly with 60s cache |
| IMPLEMENTATION_PLAN_INCREMENT_3.md | Frontend: variant tabs, period filter, own-rank highlight |
| IMPLEMENTATION_PROMPT_INCREMENT_1.md | Self-contained coding prompt for Increment 1 |
| IMPLEMENTATION_PROMPT_INCREMENT_2.md | Self-contained coding prompt for Increment 2 |
| IMPLEMENTATION_PROMPT_INCREMENT_3.md | Self-contained coding prompt for Increment 3 |

## Quick Summary

The leaderboard ranks players by rating using Redis ZADD/ZREVRANGE sorted sets. Ratings are updated on every game end. All-time, weekly, and monthly boards are supported across four variants (Bullet, Blitz, Rapid, Classical). A user's own rank is always visible even if they fall outside the top 100.
