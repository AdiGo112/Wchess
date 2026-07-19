# Feature 11 — Analysis: Architecture

## Service Map

```
┌────────────────────────────────────────────────────────────────────────┐
│  React Frontend                                                        │
│                                                                        │
│  ChessGame.jsx                                                         │
│  (on game end) → POST /analysis/request (fire-and-forget)             │
│                → GET /analysis/:gameId (poll until status≠pending)    │
│                                                                        │
│  Analysis.jsx (/analysis/:gameId)                                      │
│  AnalysisBoard.jsx  ←  analysis result from GET /analysis/:gameId     │
│  EvalBar.jsx        ←  per-move eval from analysis.moves[]            │
└────────────────────┬───────────────────────────────────────────────────┘
                     │ HTTP
                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│  NestJS Backend                                                        │
│                                                                        │
│  AnalysisController                                                    │
│  POST /analysis/request  → AnalysisService.requestAnalysis()          │
│  GET  /analysis/:gameId  → AnalysisService.getResult()                │
│             │                                                          │
│             ▼                                                          │
│  AnalysisService                                                       │
│  requestAnalysis():                                                    │
│    1. Validate game exists + belongs to user (query PostgreSQL)        │
│    2. Check if analysis already exists in MongoDB                      │
│    3. If not, create pending analysis doc, enqueue BullMQ job          │
│             │                                                          │
│             ▼                                                          │
│  BullMQ Queue: stockfish                                               │
│             │                                                          │
│             ▼                                                          │
│  StockfishAnalysisProcessor                                            │
│    1. Fetch game moves (UCI) from game document                        │
│    2. For each position: spawn stockfish, send UCI commands,           │
│       get best move + centipawn eval at depth 18                       │
│    3. Call MoveClassifier.classify() for each move                     │
│    4. Call EcoLookup.identify() on move sequence                       │
│    5. Compute accuracy % = (brilliant+good) / total * 100             │
│    6. Save result to MongoDB analysis document                         │
│             │                                                          │
│  ┌──────────┴──────────┐  ┌──────────────────────────────────────┐    │
│  │  MongoDB             │  │  PostgreSQL                          │    │
│  │  collection:         │  │  table: games                        │    │
│  │   analysis           │  │  (game metadata, move list, players) │    │
│  │  status: pending |   │  └──────────────────────────────────────┘    │
│  │   completed | failed │                                              │
│  └─────────────────────┘                                               │
│                                                                        │
│  ┌────────────────────────────┐                                        │
│  │  Backend Filesystem        │                                        │
│  │  backend/data/eco.json     │◄── EcoLookup.identify()               │
│  │  (static, 300KB)           │                                        │
│  └────────────────────────────┘                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. Game ends → frontend calls `POST /analysis/request` with `{ gameId }`.
2. `AnalysisService` creates a MongoDB document `{ gameId, status: 'pending' }` and enqueues a BullMQ job.
3. `StockfishAnalysisProcessor` picks up the job, spawns the Stockfish binary as a child process, runs UCI evaluation at depth 18 for each move.
4. After all moves are evaluated, the processor calls the move classifier, ECO lookup, and accuracy calculator.
5. The analysis document in MongoDB is updated to `{ status: 'completed', moves: [...], accuracy: { white: 82, black: 74 }, ecoCode: 'B20', ecoName: 'Sicilian Defence', ... }`.
6. The frontend polls `GET /analysis/:gameId`. When `status === 'completed'`, it renders the analysis board.

## DB Ownership

| Data | Store | Location |
|---|---|---|
| Analysis results | MongoDB | `analysis` collection |
| Game moves and metadata | PostgreSQL | `games` table (source of truth for the move list) |
| Stockfish job queue | Redis | BullMQ `bull:stockfish` namespace |
| ECO opening database | Filesystem | `backend/data/eco.json` (static JSON) |

## Frontend File Tree

```
frontend/src/
├── pages/
│   └── Analysis.jsx
├── components/
│   ├── AnalysisBoard.jsx
│   └── EvalBar.jsx
```

## Backend File Tree

```
backend/src/
├── analysis/
│   ├── analysis.module.ts
│   ├── analysis.controller.ts
│   ├── analysis.service.ts
│   └── schemas/
│       └── analysis.schema.ts
├── stockfish/
│   └── stockfish.processor.ts   (updated with per-move eval)
├── utils/
│   ├── move-classifier.ts
│   └── eco-lookup.ts
└── data/
    └── eco.json
```
