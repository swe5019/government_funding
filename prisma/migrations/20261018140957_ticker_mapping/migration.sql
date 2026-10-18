-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isMajorExchange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "secLastSyncedAt" TIMESTAMPTZ,
ADD COLUMN     "tickers" TEXT[];

-- AlterTable
ALTER TABLE "TickerMatch" ADD COLUMN     "obligationAtStake" DECIMAL(20,2),
ADD COLUMN     "parentRecipientId" TEXT;

-- CreateIndex
CREATE INDEX "Company_normalizedName_trgm_idx" ON "Company" USING GIN ("normalizedName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "TickerMatch_parentRecipientId_idx" ON "TickerMatch"("parentRecipientId");
