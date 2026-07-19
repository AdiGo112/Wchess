# Feature 11 — Analysis: Automated Testing Strategy

## Testing Layers

### Unit Tests (Jest)

**What to test:**
- `MoveClassifier` utility — pure function, no mocks needed
- `EcoLookup` utility — with a fixture `eco.json` subset
- `AnalysisService` — with mocked Mongoose model and mocked BullMQ queue
- `StockfishAnalysisProcessor` — with mocked `child_process.spawn`

**What to mock:**
- `getModelToken(Analysis.name)` — mock Mongoose model
- `getQueueToken('stockfish')` — mock BullMQ queue's `add()` method
- `child_process.spawn` — return a mock EventEmitter that emits predetermined Stockfish UCI output
- `EcoLookup` — when testing the processor, stub `identify()` to return `{ ecoCode: 'B20', ecoName: 'Sicilian Defence', ecoFamily: 'Sicilian' }`

**Unit test scenarios — MoveClassifier:**
1. `classify(cpLoss: 0, isBrilliant: false)` → `'good'`
2. `classify(cpLoss: 3, isBrilliant: true)` → `'brilliant'`
3. `classify(cpLoss: 25, isBrilliant: false)` → `'inaccuracy'`
4. `classify(cpLoss: 75, isBrilliant: false)` → `'mistake'`
5. `classify(cpLoss: 150, isBrilliant: false)` → `'blunder'`
6. `classify(cpLoss: 19, isBrilliant: false)` → `'good'` (boundary: 20 exclusive)
7. `classify(cpLoss: 20, isBrilliant: false)` → `'inaccuracy'` (boundary: 20 inclusive)
8. `classify(cpLoss: 99, isBrilliant: false)` → `'mistake'` (boundary: 99 is mistake)
9. `classify(cpLoss: 100, isBrilliant: false)` → `'blunder'` (boundary: 100 is blunder)

**Unit test scenarios — EcoLookup:**
1. `identify(['e2e4', 'e7e5'])` returns an ECO entry for King's Pawn opening
2. `identify(['d2d4', 'd7d5', 'c2c4'])` returns an ECO entry for Queen's Gambit
3. `identify(['a2a3'])` returns null (no match)
4. `identify([])` returns null

**Unit test scenarios — AnalysisService:**
1. `requestAnalysis()` creates a pending analysis document and enqueues a BullMQ job
2. `requestAnalysis()` returns 409 if analysis document already exists for gameId
3. `requestAnalysis()` returns 403 if requesting userId is not whiteUserId or blackUserId
4. `requestAnalysis()` returns 404 if game does not exist in PostgreSQL
5. `getResult()` returns `{ status: 'pending' }` if analysis document has status pending
6. `getResult()` returns the full AnalysisResultDto if status is completed
7. `getResult()` returns 404 if no analysis document exists for the gameId

**Unit test scenarios — StockfishAnalysisProcessor:**
1. `process()` calls child_process.spawn with 'stockfish' command
2. `process()` updates analysis document to status 'completed' after processing all moves
3. `process()` computes correct accuracy percentages from mock move classifications
4. `process()` updates analysis document to status 'failed' if spawn throws

### Integration Tests (Supertest + mongodb-memory-server)

1. `POST /analysis/request` with valid JWT for a game the user played → 202 with analysisId
2. `POST /analysis/request` for same gameId again → 409
3. `POST /analysis/request` for a game the user did not play → 403
4. `GET /analysis/:gameId` when no document exists → 404
5. `GET /analysis/:gameId` when document has status pending → `{ status: 'pending' }`
6. `GET /analysis/:gameId` when document is completed → full AnalysisResultDto
7. All endpoints → 401 without JWT

### E2E Tests (Playwright)

1. After game ends, navigate to `/analysis/:gameId` — spinner is shown while pending
2. Once completed (mock the API response), the board renders at starting position
3. Right arrow key advances to move 1, board FEN updates, eval bar changes
4. Left arrow key returns to starting position
5. Move with classification `blunder` in the sidebar has red styling
6. Move with classification `good` has green styling

## Coverage Targets

- `move-classifier.ts`: 100% branch coverage (all 5 classification bands + boundary values)
- `eco-lookup.ts`: 80% line coverage
- `analysis.service.ts`: 85% line coverage
- Unit coverage for processor: 75% (mock-heavy but all main branches covered)
