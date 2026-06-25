-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TimeVariant" AS ENUM ('BULLET', 'BLITZ', 'RAPID', 'CLASSICAL', 'CORRESPONDENCE', 'PUZZLE');

-- CreateEnum
CREATE TYPE "GameResult" AS ENUM ('WHITE', 'BLACK', 'DRAW', 'ABORTED');

-- CreateEnum
CREATE TYPE "GameReason" AS ENUM ('CHECKMATE', 'RESIGNATION', 'TIMEOUT', 'STALEMATE', 'AGREEMENT', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE', 'ABANDONED');

-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SWISS', 'ROUND_ROBIN', 'KNOCKOUT', 'ARENA');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "oauthProvider" TEXT,
    "oauthId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "variant" "TimeVariant" NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "provisional" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "whiteId" TEXT,
    "blackId" TEXT,
    "whiteUsername" TEXT NOT NULL,
    "blackUsername" TEXT NOT NULL,
    "whiteRating" INTEGER NOT NULL DEFAULT 1200,
    "blackRating" INTEGER NOT NULL DEFAULT 1200,
    "whiteRatingDiff" INTEGER NOT NULL DEFAULT 0,
    "blackRatingDiff" INTEGER NOT NULL DEFAULT 0,
    "result" "GameResult" NOT NULL,
    "reason" "GameReason" NOT NULL,
    "variant" "TimeVariant" NOT NULL DEFAULT 'BLITZ',
    "timeControl" INTEGER NOT NULL,
    "increment" INTEGER NOT NULL DEFAULT 0,
    "pgn" TEXT NOT NULL DEFAULT '',
    "fen" TEXT,
    "moves" TEXT[],
    "duration" INTEGER,
    "openingEco" TEXT,
    "openingName" TEXT,
    "tournamentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "TournamentFormat" NOT NULL DEFAULT 'SWISS',
    "status" "TournamentStatus" NOT NULL DEFAULT 'UPCOMING',
    "variant" "TimeVariant" NOT NULL DEFAULT 'BLITZ',
    "timeControl" INTEGER NOT NULL DEFAULT 300,
    "increment" INTEGER NOT NULL DEFAULT 0,
    "rounds" INTEGER NOT NULL DEFAULT 7,
    "maxPlayers" INTEGER NOT NULL DEFAULT 64,
    "minRating" INTEGER,
    "maxRating" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tiebreak" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Puzzle" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "moves" TEXT[],
    "rating" INTEGER NOT NULL DEFAULT 1500,
    "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "themes" TEXT[],
    "openingEco" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuzzleAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "solved" BOOLEAN NOT NULL,
    "timeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuzzleAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "UserRating_variant_rating_idx" ON "UserRating"("variant", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserRating_userId_variant_key" ON "UserRating"("userId", "variant");

-- CreateIndex
CREATE INDEX "Game_whiteId_createdAt_idx" ON "Game"("whiteId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Game_blackId_createdAt_idx" ON "Game"("blackId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_userId_key" ON "TournamentPlayer"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "Puzzle_rating_idx" ON "Puzzle"("rating");

-- CreateIndex
CREATE INDEX "PuzzleAttempt_userId_createdAt_idx" ON "PuzzleAttempt"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRating" ADD CONSTRAINT "UserRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_whiteId_fkey" FOREIGN KEY ("whiteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_blackId_fkey" FOREIGN KEY ("blackId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayer" ADD CONSTRAINT "TournamentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "Puzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
