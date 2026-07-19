# Feature 07 — Tournaments: Increment 1 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 1 of the Tournaments feature for ChessWeb, a NestJS + React chess web application. This increment adds the Prisma models and basic CRUD REST endpoints for tournaments.

## Existing Codebase State

- NestJS 10 backend at `backend/src/`
- Prisma with PostgreSQL: `backend/prisma/schema.prisma` has `User` and `Game` models
- `backend/src/app.module.ts` exists and imports `PrismaModule`
- `PrismaService` is injectable from `backend/src/prisma/prisma.service.ts`
- `@nestjs/mapped-types`, `class-validator`, `class-transformer` are installed
- `TournamentsModule` does NOT yet exist

## Step 1: Update Prisma Schema

Add to `backend/prisma/schema.prisma`:

```prisma
enum TournamentFormat {
  SWISS
  ARENA
  ROUND_ROBIN
  KNOCKOUT
}

enum TournamentStatus {
  UPCOMING
  ONGOING
  COMPLETED
}

model Tournament {
  id           String             @id @default(uuid())
  name         String
  format       TournamentFormat   @default(SWISS)
  status       TournamentStatus   @default(UPCOMING)
  timeControl  String
  maxPlayers   Int
  maxRounds    Int
  currentRound Int                @default(0)
  startAt      DateTime
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  createdById  String
  createdBy    User               @relation("CreatedTournaments", fields: [createdById], references: [id])
  players      TournamentPlayer[]
  games        Game[]
}

model TournamentPlayer {
  id           String     @id @default(uuid())
  tournamentId String
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  userId       String
  user         User       @relation("TournamentPlayers", fields: [userId], references: [id])
  score        Float      @default(0)
  buchholz     Float      @default(0)
  hasBye       Boolean    @default(false)
  joinedAt     DateTime   @default(now())

  @@unique([tournamentId, userId])
}
```

Also add to `Game` model:
```prisma
tournamentId   String?
tournament     Tournament? @relation(fields: [tournamentId], references: [id])
tournamentRound Int?
```

Also add to `User` model the required back-relations:
```prisma
createdTournaments Tournament[] @relation("CreatedTournaments")
tournamentPlayers  TournamentPlayer[] @relation("TournamentPlayers")
```

Run: `npx prisma migrate dev --name add-tournaments`

## Step 2: Create DTO

`backend/src/tournaments/dto/create-tournament.dto.ts`:

```typescript
import { IsString, IsEnum, IsInt, IsDateString, IsOptional, Min, Max, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export enum TournamentFormat {
  SWISS = 'SWISS',
  ARENA = 'ARENA',
  ROUND_ROBIN = 'ROUND_ROBIN',
  KNOCKOUT = 'KNOCKOUT',
}

export class CreateTournamentDto {
  @IsString() @MinLength(3) @MaxLength(100)
  name: string;

  @IsEnum(TournamentFormat)
  format: TournamentFormat = TournamentFormat.SWISS;

  @IsString()
  timeControl: string; // e.g. "5+3"

  @IsInt() @Min(4) @Max(256)
  maxPlayers: number;

  @IsDateString()
  startAt: string; // ISO 8601, validated as future in service

  @IsOptional() @IsInt() @Min(1) @Max(20)
  maxRounds?: number;
}
```

## Step 3: Create TournamentsService

`backend/src/tournaments/tournaments.service.ts`:

```typescript
@Injectable()
export class TournamentsService {
  constructor(private prisma: PrismaService) {}

  private computeMaxRounds(format: string, maxPlayers: number, override?: number): number {
    if (override) return override;
    switch (format) {
      case 'SWISS': return Math.ceil(Math.log2(maxPlayers));
      case 'KNOCKOUT': return Math.ceil(Math.log2(maxPlayers));
      case 'ROUND_ROBIN': return maxPlayers - 1;
      case 'ARENA': return 0; // Unlimited — time-based
      default: return Math.ceil(Math.log2(maxPlayers));
    }
  }

  async create(dto: CreateTournamentDto, createdById: string) {
    const startAt = new Date(dto.startAt);
    if (startAt <= new Date()) {
      throw new BadRequestException('startAt must be in the future');
    }
    const maxRounds = this.computeMaxRounds(dto.format, dto.maxPlayers, dto.maxRounds);
    return this.prisma.tournament.create({
      data: {
        name: dto.name,
        format: dto.format as any,
        timeControl: dto.timeControl,
        maxPlayers: dto.maxPlayers,
        maxRounds,
        startAt,
        createdById,
      },
      include: { players: { include: { user: { select: { id: true, username: true } } } } },
    });
  }

  async findAll(query: { status?: string; format?: string; page?: number; limit?: number }) {
    const { status, format, page = 1, limit = 20 } = query;
    const where: any = {};
    if (status) where.status = status;
    if (format) where.format = format;
    const [data, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        orderBy: { startAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { players: true } } },
      }),
      this.prisma.tournament.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const t = await this.prisma.tournament.findUnique({
      where: { id },
      include: { players: { include: { user: { select: { id: true, username: true, rating: true } } } } },
    });
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }
}
```

## Step 4: Create TournamentsController

`backend/src/tournaments/tournaments.controller.ts`:

GET `/tournaments` (public), GET `/tournaments/:id` (public), POST `/tournaments` (JWT required).

## Step 5: Create TournamentsModule and Register

`backend/src/tournaments/tournaments.module.ts` — import PrismaModule, provide service and controller.
Add TournamentsModule to `backend/src/app.module.ts` imports.

## Verification

```bash
# Create a tournament
curl -X POST http://localhost:3000/tournaments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Summer Open","format":"SWISS","timeControl":"5+3","maxPlayers":8,"startAt":"2026-07-01T10:00:00Z"}'
# Expected: 201 with tournament object including maxRounds: 3

# List tournaments
curl http://localhost:3000/tournaments?status=UPCOMING
# Expected: 200 with paginated list

# Get by ID
curl http://localhost:3000/tournaments/{id}
# Expected: 200 with full detail

# Past startAt
curl -X POST http://localhost:3000/tournaments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Past","format":"SWISS","timeControl":"5+3","maxPlayers":8,"startAt":"2020-01-01T10:00:00Z"}'
# Expected: 400 Bad Request
```
