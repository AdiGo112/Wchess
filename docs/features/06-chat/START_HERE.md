# 06-Chat — Start Here

## What is this feature?
Real-time in-game chat between two players during an active chess game. Messages are saved to MongoDB with a 30-day TTL. Typing indicators are broadcast in real time but not persisted. A profanity filter and 1 msg/sec rate limit protect against abuse.

## Branch
`feature/chat`

## Reading order
1. README.md — goal, user stories, dependencies
2. DOMAIN_MODEL.md — MongoDB ChatMessage schema, business rules
3. ARCHITECTURE.md — service map, Socket.io /chat namespace, Redis rate limiting
4. API_DESIGN.md — all socket events and REST endpoints
5. WORKFLOWS.md — send message, typing indicator, load history flows
6. ADR-0013-mongodb-chat-storage.md — why MongoDB for chat
7. ADR-0014-game-room-chat-scope.md — why no global/lobby chat in v1
8. DELIVERY_NOTES.md — acceptance criteria, edge cases, out of scope
9. AUTOMATED_TESTING_STRATEGY.md + AUTOMATED_TESTING_PROMPT.md — test plan
10. IMPLEMENTATION_PROMPT_BACKEND.md — AI prompt for backend
11. IMPLEMENTATION_PROMPT_FRONTEND.md — AI prompt for frontend
12. IMPLEMENTATION_PLAN_INCREMENT_1.md through IMPLEMENTATION_PLAN_INCREMENT_3.md
13. IMPLEMENTATION_PROMPT_INCREMENT_1.md through IMPLEMENTATION_PROMPT_INCREMENT_3.md

## Key decisions
- MongoDB for chat: native TTL index auto-deletes messages after 30 days
- Chat scoped to game room: no global/lobby chat to avoid moderation burden in v1
- Rate limit: 1 msg/sec per user enforced via Redis INCR + 1s EXPIRE
- Typing events: broadcast via socket but never persisted to database
