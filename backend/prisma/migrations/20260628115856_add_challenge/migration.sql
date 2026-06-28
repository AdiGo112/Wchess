-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "timeControl" INTEGER NOT NULL,
    "increment" INTEGER NOT NULL DEFAULT 0,
    "creatorColor" TEXT NOT NULL DEFAULT 'random',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gameId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_token_key" ON "Challenge"("token");

-- CreateIndex
CREATE INDEX "Challenge_creatorId_idx" ON "Challenge"("creatorId");

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
