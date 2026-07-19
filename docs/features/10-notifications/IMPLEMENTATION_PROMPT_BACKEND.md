# Feature 10 — Notifications: Backend Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation to implement the full backend for Feature 10.

---

You are implementing the Notifications backend for ChessWeb, a NestJS + TypeScript chess web application.

## Stack

- NestJS 10, TypeScript
- MongoDB via Mongoose (`@nestjs/mongoose`)
- Socket.io via `@nestjs/websockets` and `socket.io`
- BullMQ via `@nestjs/bullmq`
- SendGrid via `@sendgrid/mail`
- JWT auth guard already exists in `backend/src/auth/guards/jwt-auth.guard.ts`
- The `JwtService` is available in `AuthModule`

## What Already Exists

- `backend/src/app.module.ts` imports `MongooseModule.forRoot(...)`, `BullModule.forRoot(...)`, and `SocketIoModule`
- `backend/src/auth/` — JWT auth is fully working. `@UseGuards(JwtAuthGuard)` works. `@GetUser()` decorator extracts user from JWT with shape `{ id: string, email: string, username: string }`

## Task: Create the full Notifications module

### File 1: `backend/src/notifications/schemas/notification.schema.ts`

Create a Mongoose schema `Notification` with these exact fields:
- `userId: string` — required, indexed
- `type: NotificationType` — required, enum of GAME_RESULT | FRIEND_REQUEST | TOURNAMENT_START | ACHIEVEMENT | RATING_MILESTONE
- `title: string` — required
- `body: string` — required
- `read: boolean` — default false, indexed
- `payload: Record<string, unknown>` — type Object, default {}
- `createdAt: Date` — TTL index `expires: '90d'`, default Date.now

Add a compound index: `{ userId: 1, read: 1, createdAt: -1 }`

Export `Notification`, `NotificationDocument`, `NotificationSchema`, `NotificationType`.

### File 2: `backend/src/notifications/notifications.service.ts`

Create `NotificationsService` injectable class with these methods:

```
create(userId: string, type: NotificationType, title: string, body: string, payload: Record<string, unknown>): Promise<NotificationDto>
findForUser(userId: string, page: number, limit: number): Promise<{ data: NotificationDto[], total: number, page: number, limit: number }>
countUnread(userId: string): Promise<{ count: number }>
markRead(requestingUserId: string, notificationId: string): Promise<NotificationDto>
markAllRead(userId: string): Promise<{ updated: number }>
```

In `create()`:
1. Save the document to MongoDB
2. Call `this.gateway.sendToUser(userId, dto)` to emit the socket event
3. If type is GAME_RESULT or FRIEND_REQUEST, enqueue a BullMQ job to queue `notifications-email` with payload `{ userId, type, email: <fetched from user service or passed in>, notificationId: savedDoc._id, payload }`

In `markRead()`: throw `ForbiddenException` if `requestingUserId !== notification.userId`, throw `NotFoundException` if not found.

### File 3: `backend/src/notifications/notifications.gateway.ts`

Create `NotificationsGateway` as a `@WebSocketGateway({ cors: true, namespace: '/notifications' })`.

- On `handleConnection(client, ...args)`: extract JWT from `client.handshake.auth.token`, verify it, call `client.join('notifications:' + userId)`
- Method `sendToUser(userId: string, notification: NotificationDto)`: calls `this.server.to('notifications:' + userId).emit('new_notification', notification)`

Inject `JwtService` to verify the token on connect.

### File 4: `backend/src/notifications/notifications.controller.ts`

Create a NestJS controller with `@Controller('notifications')` and `@UseGuards(JwtAuthGuard)` on the class level:

- `GET /` → calls `service.findForUser(user.id, +page || 1, +limit || 20)`
- `GET /unread-count` → calls `service.countUnread(user.id)`
- `PATCH /:id/read` → calls `service.markRead(user.id, id)`
- `PATCH /read-all` → calls `service.markAllRead(user.id)`

### File 5: `backend/src/notifications/notifications-email.processor.ts`

Create `NotificationsEmailProcessor` as a `@Processor('notifications-email')` class.

BullMQ `@Process()` method:
1. Read `type` and `payload` from job data
2. Load HTML template from `./templates/game-result.html` or `./templates/friend-request.html` using `fs.readFileSync`
3. Replace template placeholders `{{opponent}}`, `{{result}}`, `{{ratingChange}}`, `{{fromUsername}}` with values from payload
4. Call `sgMail.send({ to: job.data.email, from: 'noreply@chessweb.app', subject, html })`
5. On error: log via NestJS `Logger`, do not rethrow (prevent BullMQ from marking as failed on SendGrid 4xx)

### File 6: `backend/src/notifications/templates/game-result.html`

HTML email for game result. Include: ChessWeb logo text, "Game Over" heading, result sentence (e.g., "You won against {{opponent}} in a {{variant}} game"), rating change (+{{ratingChange}}), a "View Game" button linking to `https://chessweb.app/history`.

### File 7: `backend/src/notifications/templates/friend-request.html`

HTML email for friend requests. Include: ChessWeb logo, "{{fromUsername}} wants to be your friend" heading, a "View Friends" button linking to `https://chessweb.app/friends`.

### File 8: `backend/src/notifications/notifications.module.ts`

Create `NotificationsModule`:
- Import `MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])`
- Import `BullModule.registerQueue({ name: 'notifications-email', limiter: { max: 3, duration: 3600000 } })`
- Import `JwtModule` (use `forRoot` with secret from `ConfigService`)
- Declare and export `NotificationsService`, `NotificationsGateway`
- Register `NotificationsEmailProcessor` as a provider

Export `NotificationsService` so other modules (GameModule, SocialModule, TournamentModule) can inject it.

## Verification Steps

1. `npm run start:dev` — no TypeScript errors
2. `curl -H "Authorization: Bearer <jwt>" http://localhost:3000/notifications/unread-count` → `{ "count": 0 }`
3. Insert a notification via Mongo shell: `db.notifications.insertOne({ userId: '<your-user-id>', type: 'GAME_RESULT', title: 'Test', body: 'Test body', read: false, payload: {}, createdAt: new Date() })`
4. Re-run the curl — should return `{ "count": 1 }`
5. `PATCH /notifications/read-all` → `{ "updated": 1 }`
6. Unread count → `{ "count": 0 }`
