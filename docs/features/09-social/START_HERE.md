# 09-Social — Start Here

## What is this feature?

The Social feature covers three interconnected capabilities:
1. **Friendships** — bidirectional friend relationships with request/accept/decline/block lifecycle
2. **Online Presence** — real-time tracking of which users are currently online via Redis TTL keys
3. **Activity Feed** — per-user timeline of what friends have been doing (games played, puzzles solved, achievements unlocked)

Every piece of Social depends on a valid JWT from the Auth feature (01-auth).

## Key Services

| Service | Responsibility | Data Store |
|---|---|---|
| `FriendshipService` | Send/accept/decline/block/unfriend; list friends with online status | PostgreSQL (`Friendship` table via Prisma) |
| `PresenceService` | Set online, refresh TTL, bulk online-status lookup | Redis (`SET user:{id}:online "1" EX 35`) |
| `PresenceGateway` | Socket.io `/presence` namespace; heartbeat handler; emit `friend_online` / `friend_offline` | Redis + Socket.io |
| `ActivityFeedService` | Publish feed entries from game/puzzle events; paginated feed queries | MongoDB `activity_feed` collection |

## Key Data Stores

| Store | What lives here |
|---|---|
| **PostgreSQL** (`Friendship` table) | All friendship rows (requesterId, addresseeId, status, timestamps) |
| **Redis** | `user:{id}:online` keys with 35-second TTL, refreshed every 25s by client heartbeat |
| **MongoDB** (`activity_feed` collection) | Activity documents: `{ actorId, actorUsername, type, targetId, targetName, createdAt }` with 30-day TTL index |

## Reading Order

1. **README.md** — feature overview, Prisma model, MongoDB schema
2. **DOMAIN_MODEL.md** — entities, value objects, business rules
3. **ARCHITECTURE.md** — service map, data flow diagrams
4. **API_DESIGN.md** — all REST endpoints and Socket.io events
5. **WORKFLOWS.md** — step-by-step flows for each user action
6. **ADR-0021-bidirectional-friendship.md** — why one row with OR query instead of two rows
7. **ADR-0022-redis-ttl-online-presence.md** — why Redis TTL over WebSocket connection tracking
8. **ADR-0023-mongodb-activity-feed.md** — why MongoDB TTL over PostgreSQL for feed
9. **AUTOMATED_TESTING_STRATEGY.md** + **AUTOMATED_TESTING_PROMPT.md** — test plan and AI test-writing prompt
10. **IMPLEMENTATION_PROMPT_BACKEND.md** — full NestJS implementation prompt
11. **IMPLEMENTATION_PROMPT_FRONTEND.md** — full React implementation prompt
12. **IMPLEMENTATION_PLAN_INCREMENT_1.md** through **IMPLEMENTATION_PLAN_INCREMENT_5.md** — phased delivery
13. **IMPLEMENTATION_PROMPT_INCREMENT_1.md** through **IMPLEMENTATION_PROMPT_INCREMENT_5.md** — per-increment AI prompts

## Quick Links to Other Features

- **01-auth** — JWT access tokens required by all social endpoints; `userId` extracted from JWT payload
- **05-game** (or equivalent) — `GameService` calls `ActivityFeedService.publish()` on game completion
- **07-puzzles** (or equivalent) — `PuzzlesService` calls `ActivityFeedService.publish()` on puzzle solve
- **Users module** — `GET /users/search` lives in UsersController but is listed in social API design because it enables the friend-add UX flow

## Key Invariants to Know Before Reading Code

- A user cannot be friends with themselves (`requesterId !== addresseeId` enforced in service)
- The `@@unique([requesterId, addresseeId])` Prisma constraint prevents duplicate requests
- BLOCKED status is unidirectional — the blocker sees BLOCKED; the blocked user sees nothing
- Presence is eventually consistent: a disconnected client remains "online" for up to 35 seconds
- Activity feed entries are visible only to accepted friends of the actor
