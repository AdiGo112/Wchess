# Feature 10 — Notifications: Start Here

## What This Feature Does

The Notifications feature gives every ChessWeb user a real-time, persistent notification system. When a game ends, a friend request arrives, a tournament begins, or the user hits a rating milestone, they receive both an in-app notification (delivered instantly via Socket.io) and, for high-priority events, an email via SendGrid. Notifications are stored in MongoDB with a 90-day TTL so users can review recent history. The frontend displays a bell icon in the navbar with a live unread count badge and a dropdown listing the ten most recent notifications.

## Branch and Reading Order

Work on branch `feature/10-notifications` branched from `main`. Read the docs in this order:

1. **README.md** — goal, user story, and dependencies
2. **ARCHITECTURE.md** — how the notification pipeline fits into the existing service graph
3. **DOMAIN_MODEL.md** — the MongoDB schema and notification types
4. **API_DESIGN.md** — REST endpoints and request/response shapes
5. **WORKFLOWS.md** — step-by-step flows for each notification trigger
6. **ADR-0024-mongodb-notification-store.md** — why MongoDB was chosen for notification storage
7. **ADR-0025-sendgrid-rate-limit.md** — why email sends are rate-limited
8. **IMPLEMENTATION_PLAN_INCREMENT_1.md** through **IMPLEMENTATION_PLAN_INCREMENT_4.md** — what each increment delivers
9. **IMPLEMENTATION_PROMPT_INCREMENT_1.md** through **4** — copy-paste prompts for implementing each increment
10. **DELIVERY_NOTES.md** — done definition and known edge cases
11. **AUTOMATED_TESTING_STRATEGY.md** and **AUTOMATED_TESTING_PROMPT.md** — how to test the feature

## How to Verify It Works

After all increments are implemented: start the dev stack (`docker compose up`), log in as two users. From user A, send a friend request to user B. In user B's browser, the bell icon should immediately show a red badge with `1`. Click the bell — the friend request notification should appear in the dropdown. If user B has notifications enabled and the SendGrid API key is set, a `friend_request` email should arrive within 60 seconds. The unread count should drop to `0` after clicking "Mark all read". Confirm via `db.notifications.find({ userId: userBId })` in MongoDB that the `read` field is set to `true`.
