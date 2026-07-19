# Feature 11 — Analysis: Automated Testing Prompt

Copy and paste the following prompt into a fresh AI conversation to generate the full test suite for Feature 11.

---

You are writing tests for the Analysis feature of ChessWeb, a NestJS + React chess web application using Stockfish for move-by-move game analysis.

## Context

The backend analysis system has these files:
- `backend/src/utils/move-classifier.ts` — exports `classify(cpLoss: number, isBrilliant: boolean): MoveClassification`. Thresholds: brilliant = cpLoss<5 AND isBrilliant, good = cpLoss<20, inaccuracy = 20-49, mistake = 50-99, blunder = >=100.
- `backend/src/utils/eco-lookup.ts` — exports `identify(uciMoves: string[]): { ecoCode: string, ecoName: string, ecoFamily: string } | null`. Reads from `backend/data/eco.json`. The JSON structure is `{ "e2e4 e7e5": { "code": "C20", "name": "King's Pawn Game", "family": "King's Pawn" }, ... }`. It finds the longest matching prefix.
- `backend/src/analysis/analysis.service.ts` — `AnalysisService` with: `requestAnalysis(userId: string, gameId: string): Promise<RequestAnalysisResponse>`, `getResult(userId: string, gameId: string): Promise<AnalysisResultDto | PendingAnalysisDto>`
- `backend/src/analysis/analysis.controller.ts` — REST controller with JWT guard on all endpoints
- `backend/src/analysis/schemas/analysis.schema.ts` — Mongoose schema with fields: gameId, status (pending|completed|failed), whiteUserId, blackUserId, accuracy ({white, black}), moves (array of AnalyzedMoveDto), ecoCode, ecoName, ecoFamily, error, completedAt
- `backend/src/stockfish/stockfish.processor.ts` — `StockfishAnalysisProcessor` that processes BullMQ jobs by spawning the `stockfish` binary via `child_process.spawn` and running UCI protocol

## Task

Write the following test files with full implementations (no placeholder comments):

### File 1: `backend/src/utils/move-classifier.spec.ts`

Pure unit tests for `classify()`. No mocks needed. Write all 9 test cases from the strategy document:
- cpLoss 0, not brilliant → 'good'
- cpLoss 3, isBrilliant → 'brilliant'
- cpLoss 25, not brilliant → 'inaccuracy'
- cpLoss 75, not brilliant → 'mistake'
- cpLoss 150, not brilliant → 'blunder'
- Boundary: cpLoss 19 → 'good'
- Boundary: cpLoss 20 → 'inaccuracy'
- Boundary: cpLoss 99 → 'mistake'
- Boundary: cpLoss 100 → 'blunder'

### File 2: `backend/src/utils/eco-lookup.spec.ts`

Unit tests for `EcoLookup.identify()`. Create a mock for `fs.readFileSync` that returns a JSON string with 3 sample ECO entries:
- `"e2e4 e7e5"`: C20 King's Pawn Game, King's Pawn
- `"d2d4 d7d5 c2c4"`: D06 Queen's Gambit, Queen's Gambit
- `"e2e4 c7c5"`: B20 Sicilian Defence, Sicilian

Write test cases:
1. `identify(['e2e4', 'e7e5'])` → `{ ecoCode: 'C20', ecoName: "King's Pawn Game", ecoFamily: "King's Pawn" }`
2. `identify(['d2d4', 'd7d5', 'c2c4'])` → `{ ecoCode: 'D06', ... }`
3. `identify(['a2a3'])` → `null`
4. `identify([])` → `null`
5. `identify(['d2d4', 'd7d5', 'c2c4', 'd5c4'])` → still returns D06 (longest matching prefix)

### File 3: `backend/src/analysis/analysis.service.spec.ts`

Unit tests using `@nestjs/testing`. Mock: `getModelToken('Analysis')` as a Jest mock object, `getQueueToken('stockfish')` as `{ add: jest.fn() }`, and a `GamesService` or `GameRepository` that returns game data.

Write test cases:
1. `requestAnalysis(userId, gameId)` — returns 202 response with analysisId when game exists and user is whitePlayer
2. `requestAnalysis()` — throws ConflictException (409) when analysis document already exists
3. `requestAnalysis()` — throws ForbiddenException (403) when userId is not a player in the game
4. `requestAnalysis()` — throws NotFoundException (404) when game does not exist
5. `getResult()` — returns `{ status: 'pending' }` when document status is pending
6. `getResult()` — returns full AnalysisResultDto when document status is completed
7. `getResult()` — throws NotFoundException (404) when no analysis document for gameId

### File 4: `backend/test/analysis.e2e-spec.ts`

Integration tests using Supertest and `mongodb-memory-server`. Seed the database with a completed game record in PostgreSQL (or mock the `GamesService`). Use JWT with userId matching the whitePlayer.

Write test cases:
1. `POST /analysis/request` valid request → 202 `{ status: 'pending', analysisId: string }`
2. `POST /analysis/request` duplicate → 409
3. `POST /analysis/request` wrong user → 403
4. `GET /analysis/:gameId` no document → 404
5. `GET /analysis/:gameId` pending → `{ status: 'pending' }`
6. `GET /analysis/:gameId` completed → full AnalysisResultDto with moves array
7. All endpoints without JWT → 401

For each test, write complete setup, seed data insertion, HTTP call, and assertions on status code and response body shape. Do not use placeholder comments.
