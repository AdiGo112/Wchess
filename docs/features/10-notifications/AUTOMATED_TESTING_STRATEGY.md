# Feature 10 — Notifications: Automated Testing Strategy

## Testing Layers

### Unit Tests (Jest, NestJS Test module)

**What to test:**
- `NotificationsService`: create(), findForUser(), countUnread(), markRead(), markAllRead()
- `NotificationsEmailProcessor`: process() with mock SendGrid client
- Move-classifier utility (no, that's Feature 11 — not applicable here)

**What to mock:**
- `NotificationModel` (Mongoose model) — use `jest.fn()` or `@nestjs/mongoose` test utilities
- `NotificationsGateway` — mock `sendToUser()` to verify it is called with correct arguments
- `BullMQ Queue` — mock `add()` to verify job is enqueued with correct payload
- `SendGrid` `@sendgrid/mail` — mock `send()` to return a resolved promise

**Unit test scenarios:**
1. `NotificationsService.create()` — saves document with correct fields and returns a NotificationDto
2. `NotificationsService.create()` — calls `gateway.sendToUser()` with the newly created notification
3. `NotificationsService.create()` — enqueues email job when type is GAME_RESULT
4. `NotificationsService.create()` — enqueues email job when type is FRIEND_REQUEST
5. `NotificationsService.create()` — does NOT enqueue email job when type is ACHIEVEMENT
6. `NotificationsService.create()` — does NOT enqueue email job when type is TOURNAMENT_START
7. `NotificationsService.create()` — does NOT enqueue email job when type is RATING_MILESTONE
8. `NotificationsService.markRead()` — returns 403 when userId does not match notification's userId
9. `NotificationsService.markRead()` — returns 404 when notification id does not exist
10. `NotificationsService.markRead()` — sets read: true and returns updated document
11. `NotificationsService.markAllRead()` — calls updateMany with correct filter and returns updated count
12. `NotificationsEmailProcessor.process()` — calls SendGrid send() with rendered HTML for GAME_RESULT
13. `NotificationsEmailProcessor.process()` — calls SendGrid send() with rendered HTML for FRIEND_REQUEST

### Integration Tests (Supertest + real MongoDB via testcontainers or in-memory-mongodb)

**What to test:**
- REST endpoints with real MongoDB reads/writes
- JWT guard rejects requests without valid token

**Integration test scenarios:**
1. `GET /notifications/unread-count` — returns 0 for user with no notifications
2. `GET /notifications/unread-count` — returns 3 for user with 3 unread and 2 read notifications
3. `GET /notifications?page=1&limit=20` — returns paginated list sorted by createdAt desc
4. `PATCH /notifications/:id/read` — returns 403 with valid JWT for wrong user
5. `PATCH /notifications/:id/read` — returns 404 for non-existent notification id
6. `PATCH /notifications/:id/read` — returns updated notification with read: true
7. `PATCH /notifications/read-all` — sets all unread to read and returns { updated: N }
8. All endpoints return 401 without JWT

### E2E Tests (Playwright or Cypress)

**What to test:**
- Bell badge updates in real time when a notification is created server-side
- Dropdown shows correct notification content
- Clicking notification navigates to correct page and marks it read

**E2E test scenarios:**
1. User A sends a friend request to User B → User B's bell badge shows 1 immediately
2. User B opens dropdown → friend request notification is visible
3. User B clicks notification → navigates to /friends, badge drops to 0
4. User B clicks "Mark all read" → all notifications show as read, badge = 0

## Coverage Targets

- Unit: 90% line coverage on `notifications.service.ts` and `notifications-email.processor.ts`
- Integration: all 4 REST endpoints covered with auth and no-auth scenarios
- E2E: the 4 happy-path scenarios above
