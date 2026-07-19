# Feature 09 — Social: Increment 4 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 4 of the Social feature for ChessWeb, a NestJS 10 + React chess platform.

**Increment 4 goal**: Implement `ActivityFeedModule` with Mongoose schema, `ActivityFeedService` (publish + paginated feed), and `ActivityFeedController`. Wire `ActivityFeedService.publish()` into `GameService` and `PuzzlesService`.

## Existing Codebase State

- `FriendshipsModule` and `PresenceModule` are fully implemented (Increments 1-3)
- `FriendshipService.getFriendIds(userId)` returns `Promise<string[]>` of accepted friend IDs
- MongoDB is connected via `@nestjs/mongoose`; `MongooseModule.forRoot(MONGODB_URI)` is in `AppModule`
- `GameService` has a method `endGame(gameId, result)` that determines winner/loser
- `PuzzlesService` has a method `submitSolution(userId, puzzleId, isCorrect)` that returns a result

## Files to Create

### File 1: `src/activity-feed/schemas/activity-feed-entry.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ActivityFeedEntryDocument = HydratedDocument<ActivityFeedEntry>;

export type ActivityType =
  | 'GAME_STARTED'
  | 'GAME_WON'
  | 'GAME_LOST'
  | 'GAME_DRAWN'
  | 'PUZZLE_SOLVED'
  | 'ACHIEVEMENT';

@Schema({ collection: 'activity_feed', timestamps: false })
export class ActivityFeedEntry {
  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true })
  actorUsername: string;

  @Prop({ required: true })
  type: string;

  @Prop({ default: null })
  targetId: string | null;

  @Prop({ default: null })
  targetName: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ required: true })
  createdAt: Date;
}

export const ActivityFeedEntrySchema = SchemaFactory.createForClass(ActivityFeedEntry);

// Compound index for feed queries: actorId IN [...] sorted by recent first
ActivityFeedEntrySchema.index({ actorId: 1, createdAt: -1 });

// NOTE: The TTL index must be created manually in MongoDB before deploying:
// db.activity_feed.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })
// Do NOT rely on autoIndex in production.
```

### File 2: `src/activity-feed/dto/feed-query.dto.ts`

```typescript
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FeedQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;
}
```

### File 3: `src/activity-feed/activity-feed.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ActivityFeedEntry, ActivityFeedEntryDocument } from './schemas/activity-feed-entry.schema';
import { FriendshipService } from '../friendships/friendships.service';

export interface PublishActivityDto {
  actorId: string;
  actorUsername: string;
  type: string;
  targetId?: string | null;
  targetName?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

@Injectable()
export class ActivityFeedService {
  private readonly logger = new Logger(ActivityFeedService.name);

  constructor(
    @InjectModel(ActivityFeedEntry.name)
    private readonly activityFeedModel: Model<ActivityFeedEntryDocument>,
    private readonly friendshipService: FriendshipService,
  ) {}

  /**
   * Fire-and-forget. Called from GameService and PuzzlesService.
   * Errors are logged but never re-thrown so callers are never disrupted.
   */
  async publish(dto: PublishActivityDto): Promise<void> {
    try {
      await this.activityFeedModel.create({
        ...dto,
        createdAt: dto.createdAt ?? new Date(),
      });
    } catch (err) {
      this.logger.error('Failed to publish activity feed entry', err);
    }
  }

  async getFeed(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ entries: ActivityFeedEntryDocument[]; nextCursor: string | null; hasMore: boolean }> {
    const friendIds = await this.friendshipService.getFriendIds(userId);

    if (friendIds.length === 0) {
      return { entries: [], nextCursor: null, hasMore: false };
    }

    const query: Record<string, unknown> = { actorId: { $in: friendIds } };
    if (cursor) {
      try {
        query._id = { $lt: new Types.ObjectId(cursor) };
      } catch {
        // Invalid cursor — ignore and return first page
      }
    }

    const effectiveLimit = Math.min(limit, 50);
    const docs = await this.activityFeedModel
      .find(query)
      .sort({ _id: -1 })
      .limit(effectiveLimit + 1)
      .exec();

    const hasMore = docs.length > effectiveLimit;
    const entries = hasMore ? docs.slice(0, effectiveLimit) : docs;
    const nextCursor = hasMore ? entries[entries.length - 1]._id.toString() : null;

    return { entries, nextCursor, hasMore };
  }
}
```

### File 4: `src/activity-feed/activity-feed.controller.ts`

```typescript
import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActivityFeedService } from './activity-feed.service';
import { FeedQueryDto } from './dto/feed-query.dto';

@Controller('social/activity-feed')
@UseGuards(JwtAuthGuard)
export class ActivityFeedController {
  constructor(private readonly activityFeedService: ActivityFeedService) {}

  @Get()
  async getFeed(@Request() req, @Query() query: FeedQueryDto) {
    return this.activityFeedService.getFeed(req.user.sub, query.cursor, query.limit);
  }
}
```

### File 5: `src/activity-feed/activity-feed.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ActivityFeedEntry, ActivityFeedEntrySchema } from './schemas/activity-feed-entry.schema';
import { ActivityFeedService } from './activity-feed.service';
import { ActivityFeedController } from './activity-feed.controller';
import { FriendshipsModule } from '../friendships/friendships.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ActivityFeedEntry.name, schema: ActivityFeedEntrySchema },
    ]),
    FriendshipsModule,
  ],
  providers: [ActivityFeedService],
  controllers: [ActivityFeedController],
  exports: [ActivityFeedService],
})
export class ActivityFeedModule {}
```

### File 6: Update `src/app.module.ts`

Add `ActivityFeedModule` to the imports array.

### File 7: Update `src/game/game.service.ts`

Inject `ActivityFeedService` and call `publish()` after determining game outcome. Add to the constructor and the `endGame` method:

```typescript
// In constructor, add:
private readonly activityFeedService: ActivityFeedService,

// In endGame(gameId, result) after determining winner/loser:
// Fire-and-forget — do NOT await
void this.activityFeedService.publish({
  actorId: winner.id,
  actorUsername: winner.username,
  type: 'GAME_WON',
  targetId: gameId,
  targetName: loser.username,
  metadata: {
    result: 'WIN',
    timeControl: game.timeControl,
    ratingChange: winner.ratingChange,
    opponent: loser.username,
  },
});

void this.activityFeedService.publish({
  actorId: loser.id,
  actorUsername: loser.username,
  type: 'GAME_LOST',
  targetId: gameId,
  targetName: winner.username,
  metadata: {
    result: 'LOSS',
    timeControl: game.timeControl,
    ratingChange: loser.ratingChange,
    opponent: winner.username,
  },
});
```

Also import `ActivityFeedModule` in `GameModule`.

### File 8: Update `src/puzzles/puzzles.service.ts`

```typescript
// In submitSolution, after confirming the solution is correct:
if (isCorrect) {
  void this.activityFeedService.publish({
    actorId: userId,
    actorUsername: user.username,
    type: 'PUZZLE_SOLVED',
    targetId: puzzleId,
    targetName: puzzle.title,
    metadata: {
      difficulty: puzzle.difficulty,
      timeMs: solveDurationMs,
    },
  });
}
```

Also import `ActivityFeedModule` in `PuzzlesModule`.

## MongoDB Index Setup (run before deploying)

Connect to your MongoDB instance and run:

```javascript
// TTL index — MUST exist before first document is inserted
db.activity_feed.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000, name: 'activity_feed_ttl' }
);

// Compound query index
db.activity_feed.createIndex(
  { actorId: 1, createdAt: -1 },
  { name: 'activity_feed_actor_created' }
);

// Verify
db.activity_feed.getIndexes();
```

## Verification

```bash
npm run start:dev

# 1. Get the feed (User A, with friends)
curl "http://localhost:3000/social/activity-feed?limit=5" \
  -H "Authorization: Bearer $TOKEN_A"
# Expected: { entries: [...], nextCursor: "...", hasMore: false/true }

# 2. Get the feed with no friends
curl "http://localhost:3000/social/activity-feed" \
  -H "Authorization: Bearer $TOKEN_ISOLATED"
# Expected: { entries: [], nextCursor: null, hasMore: false }

# 3. Manually insert a test entry (in MongoDB shell) for a friend of User A:
db.activity_feed.insertOne({
  actorId: "FRIEND_USER_ID",
  actorUsername: "friend_username",
  type: "GAME_WON",
  targetId: "game_test_001",
  targetName: "opponent_user",
  metadata: { result: "WIN", timeControl: "5+0", ratingChange: 12, opponent: "opponent_user" },
  createdAt: new Date()
});

# 4. Fetch feed again — the entry should appear
curl "http://localhost:3000/social/activity-feed" \
  -H "Authorization: Bearer $TOKEN_A"

# 5. Test cursor pagination
curl "http://localhost:3000/social/activity-feed?cursor=NEXT_CURSOR_FROM_PREVIOUS_RESPONSE" \
  -H "Authorization: Bearer $TOKEN_A"
# Expected: entries with _id < cursor
```
