# Feature 09 — Social: Increment 4 Implementation Plan

## Scope

Implement the `ActivityFeedModule` with the Mongoose schema for `ActivityFeedEntry`, `ActivityFeedService` (publish and paginated feed query), and `ActivityFeedController` (`GET /social/activity-feed`). Create the MongoDB TTL and compound indexes. Wire `ActivityFeedService` into `GameService` and `PuzzlesService` so game completions and puzzle solves automatically publish feed entries. Unit tests for `ActivityFeedService` are also written.

## Files Created / Modified

| File | Action |
|------|--------|
| `src/activity-feed/activity-feed.module.ts` | Created |
| `src/activity-feed/activity-feed.service.ts` | Created |
| `src/activity-feed/activity-feed.controller.ts` | Created |
| `src/activity-feed/schemas/activity-feed-entry.schema.ts` | Created |
| `src/activity-feed/dto/feed-query.dto.ts` | Created |
| `src/activity-feed/activity-feed.service.spec.ts` | Created |
| `src/game/game.service.ts` | Modified — inject `ActivityFeedService`, call `publish()` on game end |
| `src/puzzles/puzzles.service.ts` | Modified — inject `ActivityFeedService`, call `publish()` on correct solve |
| `src/app.module.ts` | Modified — import `ActivityFeedModule`, add `MongooseModule.forRoot(MONGODB_URI)` if not present |

## Steps

### Step 1: Create Mongoose schema

```typescript
// src/activity-feed/schemas/activity-feed-entry.schema.ts
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ActivityFeedEntry {
  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true })
  actorUsername: string;

  @Prop({ required: true })
  type: string; // ActivityType values

  @Prop({ default: null })
  targetId: string | null;

  @Prop({ default: null })
  targetName: string | null;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ required: true })
  createdAt: Date;
}
```

Create the TTL index manually (see DELIVERY_NOTES.md). In the schema file, add the compound index annotation:

```typescript
@Schema({ indexes: [{ fields: { actorId: 1, createdAt: -1 } }] })
```

### Step 2: Implement `ActivityFeedService`

**`publish(entry)`**: calls `this.activityFeedModel.create(entry)` in a try/catch. On error, logs with `Logger` and returns void — does not re-throw.

**`getFeed(userId, cursor?, limit=20)`**: 
1. `const friendIds = await this.friendshipService.getFriendIds(userId)`
2. If empty, return early with empty response
3. Build MongoDB query: `{ actorId: { $in: friendIds } }` + optional `_id: { $lt: ObjectId(cursor) }`
4. `.sort({ _id: -1 }).limit(limit + 1).exec()`
5. Determine `hasMore` by checking if `docs.length > limit`
6. Return `{ entries, nextCursor, hasMore }`

### Step 3: Implement `ActivityFeedController`

Route: `GET /social/activity-feed`

```typescript
@Get()
@UseGuards(JwtAuthGuard)
async getFeed(@Request() req, @Query() query: FeedQueryDto) {
  return this.activityFeedService.getFeed(req.user.sub, query.cursor, query.limit);
}
```

### Step 4: Wire into GameService and PuzzlesService

In `GameService.endGame()`, inject `ActivityFeedService` and call `publish()` for both the winner (`GAME_WON`) and the loser (`GAME_LOST`). For draws, publish `GAME_DRAWN` for both.

In `PuzzlesService.submitSolution()`, call `publish()` with `PUZZLE_SOLVED` when the answer is correct.

### Step 5: Module wiring

`ActivityFeedModule` imports: `MongooseModule.forFeature(...)`, `FriendshipsModule`.
`ActivityFeedModule` exports: `ActivityFeedService` (so GameModule, PuzzlesModule can import).
`GameModule` and `PuzzlesModule` import `ActivityFeedModule`.

### Step 6: Write unit tests

See `AUTOMATED_TESTING_STRATEGY.md` for test cases.

## Acceptance Criteria

- [ ] `GET /social/activity-feed` returns 200 with `{ entries, nextCursor, hasMore }`
- [ ] `GET /social/activity-feed` returns only entries from accepted friends
- [ ] `GET /social/activity-feed?cursor=<id>` returns entries older than the cursor
- [ ] Completing a game creates an `activity_feed` document for both players in MongoDB
- [ ] Solving a puzzle creates a `PUZZLE_SOLVED` document in MongoDB
- [ ] TTL index exists on `activity_feed.createdAt` (verify with `db.activity_feed.getIndexes()`)
- [ ] Compound index exists on `{ actorId: 1, createdAt: -1 }`
- [ ] `publish()` does not throw even when MongoDB is unavailable (error is logged only)
- [ ] Unit tests pass

## Complexity

**M** — The service logic is straightforward. The main complexity is wiring `ActivityFeedModule` into `GameModule` and `PuzzlesModule` without introducing circular dependencies, and ensuring the MongoDB indexes are created correctly before the first document is inserted.
