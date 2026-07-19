# Feature 10 — Increment 2 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 2 of the Notifications feature for ChessWeb. Increment 1 is complete: the MongoDB schema, `NotificationsService`, REST controller, and module exist. You are now adding the Socket.io gateway for real-time push delivery.

## Current Codebase State

Increment 1 is complete. The following files exist:
- `backend/src/notifications/schemas/notification.schema.ts` — Notification schema with fields: userId, type, title, body, read, payload, createdAt (TTL 90d), compound index on { userId, read, createdAt }
- `backend/src/notifications/notifications.service.ts` — NotificationsService with create(), findForUser(), countUnread(), markRead(), markAllRead()
- `backend/src/notifications/notifications.controller.ts` — REST controller with JWT guard
- `backend/src/notifications/notifications.module.ts` — NotificationsModule

The NestJS app uses `socket.io` via `@nestjs/websockets`. The `@nestjs/platform-socket.io` adapter is set in `backend/src/main.ts` with `app.useWebSocketAdapter(new IoAdapter(app))`. The `JwtService` is provided by `AuthModule` which exports it.

## What to Create

### File: `backend/src/notifications/notifications.gateway.ts`

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/notifications' })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) throw new Error('No token');
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;
      await client.join('notifications:' + userId);
      this.logger.log(`Client ${client.id} joined notifications:${userId}`);
    } catch (err) {
      this.logger.warn(`Unauthorized socket connection: ${err.message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  sendToUser(userId: string, notification: unknown) {
    this.server.to('notifications:' + userId).emit('new_notification', notification);
  }
}
```

## What to Modify

### `backend/src/notifications/notifications.service.ts`

1. Inject `NotificationsGateway` via constructor: `private readonly gateway: NotificationsGateway`
2. In `create()`, after saving the document, add: `this.gateway.sendToUser(userId, savedDoc.toObject())`

Use `forwardRef()` if there is a circular dependency between the service and gateway:
```typescript
@Inject(forwardRef(() => NotificationsGateway))
private readonly gateway: NotificationsGateway
```

### `backend/src/notifications/notifications.module.ts`

1. Add `JwtModule.registerAsync({ imports: [ConfigModule], useFactory: (config: ConfigService) => ({ secret: config.get('JWT_SECRET') }), inject: [ConfigService] })` to `imports`
2. Add `NotificationsGateway` to `providers`

## Verification Steps

1. `npm run start:dev` — no errors
2. Open the browser console on the frontend dev server and run:
```javascript
const socket = io('http://localhost:3000/notifications', { auth: { token: localStorage.getItem('chessweb_token') } });
socket.on('new_notification', (n) => console.log('RECEIVED:', n));
socket.on('connect', () => console.log('Connected:', socket.id));
```
3. In a second browser tab (or via curl), trigger notification creation — for now, temporarily expose a test endpoint `POST /notifications/test` that calls `NotificationsService.create()` with hardcoded data.
4. The first browser tab console should log `RECEIVED: { type: 'GAME_RESULT', ... }` within 500ms.
5. Connect without a JWT: `io('http://localhost:3000/notifications', { auth: { token: 'bad-token' } })` — should disconnect immediately.
6. Remove the test endpoint after verification.
