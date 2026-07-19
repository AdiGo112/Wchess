# Docker Setup

All three databases run locally via Docker Compose. One command starts everything.

---

## docker-compose.yml (repo root)

```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       chessweb
      POSTGRES_USER:     chess
      POSTGRES_PASSWORD: chess123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chess -d chessweb"]
      interval: 5s
      timeout: 5s
      retries: 5

  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongodata:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  mongodata:
  redisdata:
```

---

## Start / Stop

```bash
# Start all three databases (detached)
docker compose up -d

# Check all are healthy
docker compose ps

# Stop (keep data)
docker compose stop

# Stop + delete volumes (wipe data)
docker compose down -v

# View logs
docker compose logs postgres
docker compose logs mongo
docker compose logs redis
```

---

## First-time setup

```bash
# 1. Start databases
docker compose up -d

# 2. Wait for postgres to be ready, then run Prisma migration
cd backend
npx prisma migrate dev --name init

# 3. Verify connection
npx prisma studio        # Opens Prisma Studio in browser

# 4. (Optional) Seed test data
npx ts-node prisma/seed.ts
```

---

## Connecting to databases manually

```bash
# PostgreSQL
docker exec -it chessweb-postgres-1 psql -U chess -d chessweb

# MongoDB
docker exec -it chessweb-mongo-1 mongosh chessweb

# Redis
docker exec -it chessweb-redis-1 redis-cli
```

---

## Prisma migrations workflow

```bash
# Create new migration after schema change
npx prisma migrate dev --name <describe_change>

# Apply migrations in production
npx prisma migrate deploy

# Generate Prisma Client (after schema change)
npx prisma generate

# Reset DB (wipes data + re-runs all migrations)
npx prisma migrate reset
```

---

## Port summary

| Service | Port | Connection string |
|---|---|---|
| PostgreSQL | 5432 | `postgresql://chess:chess123@localhost:5432/chessweb` |
| MongoDB | 27017 | `mongodb://localhost:27017/chessweb` |
| Redis | 6379 | `redis://localhost:6379` |
| NestJS API | 3000 | `http://localhost:3000` |
| React Dev | 5173 | `http://localhost:5173` |
