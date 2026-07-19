# 08-Puzzles — API Design

## Authentication

| Route | Auth |
|---|---|
| `GET /puzzles/daily` | Public (no JWT) |
| `GET /puzzles/:id` | Public (no JWT) |
| `GET /puzzles/themes` | Public (no JWT) |
| `GET /puzzles` | Public (no JWT) |
| `GET /puzzles/next` | Required (JWT Bearer) |
| `POST /puzzles/:id/attempt` | Required (JWT Bearer) |
| `GET /puzzles/stats` | Required (JWT Bearer) |

All protected routes validate the JWT via `JwtAuthGuard`. The guard extracts `userId` from `req.user.sub`.

---

## Endpoints

### GET /puzzles/daily

Returns today's puzzle (same for all users). Reads puzzle ID from Redis key `puzzle:daily`, then fetches the full puzzle from PostgreSQL. If Redis is empty (first run before cron fires), falls back to a random puzzle with rating 1400–1600.

**Response 200:**
```typescript
interface DailyPuzzleResponse {
  id: string;
  fen: string;
  moves: string;       // space-separated UCI moves
  rating: number;
  themes: string[];
  openingTags: string[];
  isDaily: true;
}
```

**Response 503:**
```json
{ "statusCode": 503, "message": "No daily puzzle available" }
```

---

### GET /puzzles/:id

Returns a single puzzle by Lichess ID.

**Path parameter:** `id` — Lichess puzzle ID (string)

**Response 200:**
```typescript
interface PuzzleResponse {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  themes: string[];
  openingTags: string[];
}
```

**Response 404:**
```json
{ "statusCode": 404, "message": "Puzzle not found" }
```

---

### GET /puzzles/next

Returns the next puzzle for the authenticated user. Checks the SM-2 queue (UserPuzzleAttempt rows with `nextReview <= now()`, ordered by `nextReview ASC`). If the queue is empty, returns a random puzzle the user has never attempted.

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200:**
```typescript
interface NextPuzzleResponse {
  puzzle: PuzzleResponse;
  sm2State: {
    easeFactor: number;
    interval: number;
    repetitions: number;
    nextReview: string; // ISO 8601
  } | null; // null if user has never attempted this puzzle
  source: 'due' | 'new'; // 'due' = SM-2 queue, 'new' = never seen before
}
```

**Response 404:**
```json
{ "statusCode": 404, "message": "No puzzles available" }
```

---

### POST /puzzles/:id/attempt

Records a puzzle attempt, updates Glicko-2 ratings for both puzzle and user, and recalculates SM-2 schedule.

**Headers:** `Authorization: Bearer <accessToken>`

**Path parameter:** `id` — Lichess puzzle ID

**Request body:**
```typescript
interface AttemptPuzzleDto {
  solved: boolean;
  timeTaken: number; // milliseconds, must be > 0
}
```

**Validation:**
- `solved`: required boolean
- `timeTaken`: required number, min 1, max 3_600_000 (1 hour cap)

**Response 201:**
```typescript
interface AttemptPuzzleResponse {
  attemptId: string;
  solved: boolean;
  quality: 0 | 2 | 3 | 4 | 5;  // derived quality score
  nextReview: string;             // ISO 8601 date
  sm2State: {
    easeFactor: number;
    interval: number;
    repetitions: number;
  };
  ratingDelta: {
    userRatingBefore: number;
    userRatingAfter: number;
    puzzleRatingBefore: number;
    puzzleRatingAfter: number;
  };
}
```

**Response 400:**
```json
{ "statusCode": 400, "message": ["timeTaken must be a positive number"] }
```

**Response 404:**
```json
{ "statusCode": 404, "message": "Puzzle not found" }
```

---

### GET /puzzles/themes

Returns all available themes with the count of puzzles for each. Useful for filtering UI.

**Response 200:**
```typescript
interface ThemesResponse {
  themes: Array<{
    name: string;    // e.g. "fork"
    count: number;   // number of puzzles tagged with this theme
  }>;
}
```

---

### GET /puzzles

Returns a paginated list of puzzles, optionally filtered by theme and/or rating range.

**Query parameters:**
```typescript
interface PuzzleListQuery {
  theme?: string;      // e.g. "fork" — uses PostgreSQL GIN array containment @>
  minRating?: number;  // default 0
  maxRating?: number;  // default 9999
  page?: number;       // default 1
  limit?: number;      // default 20, max 100
}
```

**Response 200:**
```typescript
interface PuzzleListResponse {
  data: PuzzleResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**Example request:**
```
GET /puzzles?theme=fork&minRating=1200&maxRating=1800&page=2
```

---

### GET /puzzles/stats

Returns the authenticated user's puzzle statistics.

**Headers:** `Authorization: Bearer <accessToken>`

**Response 200:**
```typescript
interface PuzzleStatsResponse {
  totalAttempts: number;
  totalSolved: number;
  accuracy: number;           // 0–100 percentage
  currentRating: number;      // user's current puzzle Glicko-2 rating
  ratingDeviation: number;
  streak: number;             // consecutive days daily puzzle solved
  lastSolvedDate: string | null; // ISO date string "YYYY-MM-DD"
  ratingByTheme: Record<string, {
    rating: number;
    totalAttempts: number;
    solved: number;
  }>;
}
```

---

## Error Response Shape

All error responses follow NestJS default format:

```typescript
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}
```

## Route Order (NestJS Controller)

NestJS matches routes top-to-bottom, so literal path segments must appear before parameterized ones. The controller must register routes in this order:

```
GET /puzzles/daily   ← must be before GET /puzzles/:id
GET /puzzles/next    ← must be before GET /puzzles/:id
GET /puzzles/themes  ← must be before GET /puzzles/:id
GET /puzzles/stats   ← must be before GET /puzzles/:id
GET /puzzles/:id
GET /puzzles
POST /puzzles/:id/attempt
```
