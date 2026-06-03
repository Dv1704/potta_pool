-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "influencerId" TEXT;

-- CreateTable
CREATE TABLE "InfluencerEarning" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "platformFee" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfluencerEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerEarning_matchId_key" ON "InfluencerEarning"("matchId");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerEarning" ADD CONSTRAINT "InfluencerEarning_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerEarning" ADD CONSTRAINT "InfluencerEarning_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
