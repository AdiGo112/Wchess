-- CreateTable
CREATE TABLE "GameAnalysis" (
    "gameId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "moves" JSONB NOT NULL,
    "accuracyWhite" DOUBLE PRECISION NOT NULL,
    "accuracyBlack" DOUBLE PRECISION NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'stockfish-18-lite',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAnalysis_pkey" PRIMARY KEY ("gameId")
);

-- AddForeignKey
ALTER TABLE "GameAnalysis" ADD CONSTRAINT "GameAnalysis_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
