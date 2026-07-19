# Feature 10 — Notifications: Automated Testing Prompt

Copy and paste the following prompt into a fresh AI conversation to generate the full test suite for Feature 10.

---

You are writing tests for the Notifications feature of ChessWeb, a NestJS + React chess web application.

## Context

The backend is NestJS. The notification system has these files:
- `backend/src/notifications/notifications.service.ts` — `NotificationsService` with methods: `create(userId, type, title, body, payload)`, `findForUser(userId, page, limit)`, `countUnread(userId)`, `markRead(userId, notificationId)`, `markAllRead(userId)`
- `backend/src/notifications/notifications.gateway.ts` — `NotificationsGateway` with `sendToUser(userId, notification)` that emits `new_notification` to socket room `notifications:{userId}`
- `backend/src/notifications/notifications-email.processor.ts` — `NotificationsEmailProcessor` that processes BullMQ jobs and sends email via `@sendgrid/mail`
- `backend/src/notifications/notifications.controller.ts` — NestJS controller with JWT guard on all endpoints
- `backend/src/notifications/schemas/notification.schema.ts` — Mongoose schema with fields: `userId`, `type` (enum: GAME_RESULT|FRIEND_REQUEST|TOURNAMENT_START|ACHIEVEMENT|RATING_MILESTONE), `title`, `body`, `read` (default false), `payload` (object), `createdAt` (TTL 90d)

## Task

Write the following test files with full test implementations (no placeholders):

### File 1: `backend/src/notifications/notifications.service.spec.ts`

Unit tests using Jest and `@nestjs/testing`. Mock `getModelToken(Notification.name)` for the Mongoose model. Mock `NotificationsGateway`. Mock `getQueueToken('notifications-email')` for BullMQ queue.

Write these exact test cases:
1. `create() saves document with correct fields and returns NotificationDto`
2. `create() calls gateway.sendToUser with the created notification`
3. `create() enqueues email job when type is GAME_RESULT`
4. `create() enqueues email job when type is FRIEND_REQUEST`
5. `create() does NOT enqueue email job when type is ACHIEVEMENT`
6. `create() does NOT enqueue email job when type is TOURNAMENT_START`
7. `create() does NOT enqueue email job when type is RATING_MILESTONE`
8. `markRead() throws ForbiddenException when requesting userId does not match notification userId`
9. `markRead() throws NotFoundException when notification id does not exist`
10. `markRead() sets read: true and returns the updated document`
11. `markAllRead() calls updateMany with { userId, read: false } filter and returns { updated: N }`

### File 2: `backend/src/notifications/notifications-email.processor.spec.ts`

Unit tests for `NotificationsEmailProcessor`. Mock `@sendgrid/mail`'s `send()`. Use real `fs.readFileSync` for HTML template loading (mock the path or use a fixture string).

Write these exact test cases:
1. `process() calls sgMail.send() with correct to, subject, and html for GAME_RESULT job`
2. `process() calls sgMail.send() with correct to, subject, and html for FRIEND_REQUEST job`
3. `process() logs an error and does not throw if sgMail.send() rejects`

### File 3: `backend/test/notifications.e2e-spec.ts`

Integration/E2E tests using Supertest and `@nestjs/testing`. Use `mongodb-memory-server` for an in-memory MongoDB instance.

Write these exact test cases:
1. `GET /notifications/unread-count returns { count: 0 } for user with no notifications`
2. `GET /notifications/unread-count returns { count: 3 } for user with 3 unread and 2 read notifications`
3. `GET /notifications?page=1&limit=20 returns notifications sorted by createdAt desc`
4. `PATCH /notifications/:id/read returns 401 without JWT`
5. `PATCH /notifications/:id/read returns 403 with JWT of different user`
6. `PATCH /notifications/:id/read returns 404 for non-existent id`
7. `PATCH /notifications/:id/read returns updated notification with read: true`
8. `PATCH /notifications/read-all returns { updated: 3 } and sets all unread to read`

For each test, include the full setup (seed data, JWT generation using a test secret), the HTTP call via Supertest, and assertions on status code and response body.

Use `beforeAll` / `afterAll` to start and stop the MongoDB memory server. Generate JWTs using `jsonwebtoken.sign()` with secret `test-secret`. Wire the NestJS app with `JwtModule.register({ secret: 'test-secret' })`.

Do not use placeholder comments. Write complete, runnable test code.
