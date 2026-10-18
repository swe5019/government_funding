-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "AlertDelivery_sentAt_idx" ON "AlertDelivery"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_userId_name_key" ON "Watchlist"("userId", "name");

