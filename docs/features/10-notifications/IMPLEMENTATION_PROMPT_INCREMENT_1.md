# Feature 10 — Increment 1 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 1 of the Notifications feature for ChessWeb, a NestJS + TypeScript + MongoDB backend chess application.

## Current Codebase State

- NestJS 10, TypeScript, MongoDB via `@nestjs/mongoose`, JWT auth guard at `backend/src/auth/guards/jwt-auth.guard.ts`
- `@GetUser()` decorator in `backend/src/auth/decorators/get-user.decorator.ts` returns `{ id: string, email: string, username: string }` from JWT payload
- `backend/src/app.module.ts` already imports `MongooseModule.forRoot(process.env.MONGODB_URI)` and has `ConfigModule.forRoot({ isGlobal: true })`
- The `backend/src/notifications/` directory does not exist yet — create it

## What to Create

### 1. `backend/src/notifications/schemas/notification.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  GAME_RESULT       = 'GAME_RESULT',
  FRIEND_REQUEST    = 'FRIEND_REQUEST',
  TOURNAMENT_START  = 'TOURNAMENT_START',
  ACHIEVEMENT       = 'ACHIEVEMENT',
  RATING_MILESTONE  = 'RATING_MILESTONE',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ type: Date, expires: '90d', default: Date.now })
  createdAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
```

### 2. `backend/src/notifications/notifications.service.ts`

Create `NotificationsService` with `@Injectable()`. Inject `@InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>`.

Implement:
- `async create(userId: string, type: NotificationType, title: string, body: string, payload: Record<string, unknown>)` — creates and returns the MongoDB document as a plain object (use `.lean()` or `.toObject()`)
- `async findForUser(userId: string, page: number, limit: number)` — returns `{ data, total, page, limit }` sorted by `createdAt: -1`, skip `(page-1)*limit`, limit `limit`
- `async countUnread(userId: string)` — returns `{ count: number }` using `this.notificationModel.countDocuments({ userId, read: false })`
- `async markRead(requestingUserId: string, notificationId: string)` — find by `_id`, throw `NotFoundException` if not found, throw `ForbiddenException` if `doc.userId !== requestingUserId`, update `read: true`, return updated document
- `async markAllRead(userId: string)` — `updateMany({ userId, read: false }, { $set: { read: true } })`, return `{ updated: result.modifiedCount }`

Note: In this increment, `create()` does NOT need to call a gateway or enqueue email — that comes in increments 2 and 3. Just save and return.

### 3. `backend/src/notifications/notifications.controller.ts`

```typescript
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@GetUser() user, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.notificationsService.findForUser(user.id, +page, +limit);
  }

  @Get('unread-count')
  countUnread(@GetUser() user) {
    return this.notificationsService.countUnread(user.id);
  }

  @Patch(':id/read')
  markRead(@GetUser() user, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }

  @Patch('read-all')
  markAllRead(@GetUser() user) {
    return this.notificationsService.markAllRead(user.id);
  }
}
```

### 4. `backend/src/notifications/notifications.module.ts`

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

### 5. Update `backend/src/app.module.ts`

Add `NotificationsModule` to the `imports` array.

## Verification Steps

1. `cd backend && npm run build` — no errors
2. `npm run start:dev`
3. `curl -H "Authorization: Bearer <your-jwt>" http://localhost:3000/notifications/unread-count` → `{"count":0}`
4. In MongoDB shell: `db.notifications.insertOne({ userId: '<your-user-id>', type: 'GAME_RESULT', title: 'Test', body: 'Test body', read: false, payload: {}, createdAt: new Date() })`
5. Re-run curl → `{"count":1}`
6. `curl -X PATCH -H "Authorization: Bearer <jwt>" http://localhost:3000/notifications/read-all` → `{"updated":1}`
7. Unread count curl → `{"count":0}`
8. `curl http://localhost:3000/notifications/unread-count` (no JWT) → 401
