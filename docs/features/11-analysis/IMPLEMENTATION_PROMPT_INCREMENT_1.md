# Feature 11 — Increment 1 Implementation Prompt

Copy and paste this entire prompt into a fresh AI conversation.

---

You are implementing Increment 1 of the Analysis feature for ChessWeb, a NestJS + TypeScript chess application.

## Current Codebase State

- NestJS 10, TypeScript, MongoDB via `@nestjs/mongoose`, BullMQ via `@nestjs/bullmq`
- `backend/src/app.module.ts` imports `MongooseModule.forRoot(...)` and `BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } })`
- `backend/src/games/games.service.ts` exists and exports `GamesService` with method `findById(gameId: string): Promise<{ id: string, whiteUserId: string, blackUserId: string, moves: string[], status: 'in_progress' | 'completed' } | null>`
- JWT guard at `backend/src/auth/guards/jwt-auth.guard.ts`, `@GetUser()` decorator returns `{ id: string, email: string, username: string }`
- The `backend/src/analysis/` directory does not exist yet

## What to Create

### File 1: `backend/src/analysis/schemas/analysis.schema.ts`

Mongoose schema for the `Analysis` model. Fields:
- `gameId: string` — required, unique, indexed
- `status: 'pending' | 'completed' | 'failed'` — default 'pending'
- `whiteUserId: string` — required
- `blackUserId: string` — required
- `accuracy: { white: number, black: number }` — type Object
- `moves: object[]` — type [Object], default []
- `ecoCode: string`, `ecoName: string`, `ecoFamily: string`
- `error: string`
- `completedAt: Date`
- `timestamps: true` (adds createdAt, updatedAt automatically)

Export `Analysis`, `AnalysisDocument`, `AnalysisSchema`.

### File 2: `backend/src/analysis/analysis.service.ts`

`AnalysisService` with two methods:

`async requestAnalysis(userId: string, gameId: string): Promise<{ status: 'pending', analysisId: string, message: string }>`
1. Call `GamesService.findById(gameId)` — if null, throw `NotFoundException('Game not found')`
2. If `game.whiteUserId !== userId && game.blackUserId !== userId`, throw `ForbiddenException('You are not a player in this game')`
3. Check `AnalysisModel.findOne({ gameId })` — if exists, throw `ConflictException('Analysis already exists for this game. Poll GET /analysis/:gameId')`
4. Create new analysis doc: `{ gameId, status: 'pending', whiteUserId: game.whiteUserId, blackUserId: game.blackUserId }`
5. Enqueue BullMQ job: `await this.stockfishQueue.add('analyze', { gameId, moves: game.moves, whiteUserId: game.whiteUserId, blackUserId: game.blackUserId })`
6. Return `{ status: 'pending', analysisId: savedDoc._id.toString(), message: 'Analysis queued. Poll GET /analysis/:gameId for results.' }`

`async getResult(userId: string, gameId: string): Promise<object>`
1. Find doc by `gameId`
2. If null, throw `NotFoundException`
3. If `doc.whiteUserId !== userId && doc.blackUserId !== userId`, throw `ForbiddenException`
4. If `doc.status === 'pending'`, return `{ status: 'pending', gameId }`
5. If `doc.status === 'failed'`, return `{ status: 'failed', gameId, error: doc.error }`
6. Return the full document as an object (use `.lean()` or `.toObject()`)

### File 3: `backend/src/analysis/analysis.controller.ts`

```typescript
@Controller('analysis')
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('request')
  @HttpCode(202)
  requestAnalysis(@GetUser() user, @Body() body: { gameId: string }) {
    if (!body.gameId) throw new BadRequestException('gameId is required');
    return this.analysisService.requestAnalysis(user.id, body.gameId);
  }

  @Get(':gameId')
  getResult(@GetUser() user, @Param('gameId') gameId: string) {
    return this.analysisService.getResult(user.id, gameId);
  }
}
```

### File 4: `backend/src/analysis/analysis.module.ts`

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Analysis.name, schema: AnalysisSchema }]),
    BullModule.registerQueue({ name: 'stockfish' }),
    GamesModule,  // Import GamesModule to use GamesService
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
```

Add `AnalysisModule` to `backend/src/app.module.ts` imports.

## Verification Steps

1. `npm run build` — no errors
2. `npm run start:dev`
3. Obtain a JWT for a user who is `whiteUserId` in an existing game
4. `curl -X POST -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" -d '{"gameId":"<uuid>"}' http://localhost:3000/analysis/request` → 202 `{"status":"pending","analysisId":"..."}`
5. Re-post same gameId → 409
6. `curl -H "Authorization: Bearer <jwt>" http://localhost:3000/analysis/<gameId>` → `{"status":"pending","gameId":"..."}`
7. Check Bull Board → job visible in `stockfish` queue
