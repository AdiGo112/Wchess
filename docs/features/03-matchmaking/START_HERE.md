# 03-Matchmaking — Start Here

## What is this feature?
Pairs players together for real-time chess games. Supports quick-match queue (Redis List per variant), friend challenges via share link, and computer game creation. Matchmaking hands off to the game-engine (02) which takes over once a game room is created.

## Branch
`feature/matchmaking`

## Reading order
1. README.md
2. DOMAIN_MODEL.md
3. ARCHITECTURE.md
4. API_DESIGN.md
5. WORKFLOWS.md
6. ADR-0007-redis-list-queues.md
7. ADR-0008-rating-tolerance-relaxation.md
8. DELIVERY_NOTES.md
9. AUTOMATED_TESTING_STRATEGY.md + AUTOMATED_TESTING_PROMPT.md
10. IMPLEMENTATION_PROMPT_BACKEND.md + IMPLEMENTATION_PROMPT_FRONTEND.md
11. Increment plans and prompts (1–3)
