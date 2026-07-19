# Feature 11 — Increment 1: Analysis Request Queue + Status API

## Scope of Work

Create the MongoDB schema for analysis results, the `AnalysisService` with just the `requestAnalysis()` and `getResult()` methods (no actual Stockfish work yet), the REST controller, and the NestJS module. When `POST /analysis/request` is called, a pending analysis document is created in MongoDB and a BullMQ job is enqueued (the processor will be built in Increment 2). `GET /analysis/:gameId` polls and returns the current status.

## Files Created

- `backend/src/analysis/schemas/analysis.schema.ts`
- `backend/src/analysis/analysis.service.ts`
- `backend/src/analysis/analysis.controller.ts`
- `backend/src/analysis/analysis.module.ts`

## Files Modified

- `backend/src/app.module.ts` — add `AnalysisModule`

## Acceptance Criteria

1. `POST /analysis/request` with a valid JWT and a gameId that belongs to the user → 202 with `{ status: 'pending', analysisId: '<mongodb-id>' }`
2. `POST /analysis/request` for the same gameId again → 409 Conflict
3. `POST /analysis/request` for a game the user did not play → 403 Forbidden
4. `GET /analysis/:gameId` returns `{ status: 'pending' }` immediately after the request
5. Bull Board shows a job in the `stockfish` queue with the correct gameId payload
6. All endpoints return 401 without JWT

## Complexity

**Small** — Standard NestJS module creation with MongoDB schema, two endpoints, and BullMQ job enqueueing. No Stockfish or analysis logic yet.
