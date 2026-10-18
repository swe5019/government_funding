-- DropForeignKey
ALTER TABLE "FederalRegisterDoc" DROP CONSTRAINT "FederalRegisterDoc_programSlug_fkey";

-- DropIndex
DROP INDEX "FederalRegisterDoc_publishedAt_idx";

-- AlterTable
ALTER TABLE "DodAnnouncement" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "contractingActivity" TEXT,
ADD COLUMN     "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "FederalRegisterDoc" DROP CONSTRAINT "FederalRegisterDoc_pkey",
ADD COLUMN     "abstract" TEXT,
ALTER COLUMN "programSlug" SET NOT NULL,
ADD CONSTRAINT "FederalRegisterDoc_pkey" PRIMARY KEY ("documentNumber", "programSlug");

-- AlterTable
ALTER TABLE "SecFiling" ADD COLUMN     "items" TEXT,
ADD COLUMN     "matchedTerms" TEXT[];

-- CreateTable
CREATE TABLE "SamAwardNotice" (
    "noticeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "solicitationNumber" TEXT,
    "postedDate" DATE NOT NULL,
    "awardDate" DATE,
    "awardNumber" TEXT,
    "amount" DECIMAL(20,2),
    "awardeeName" TEXT,
    "awardeeUei" TEXT,
    "recipientId" TEXT,
    "department" TEXT,
    "office" TEXT,
    "naicsCode" TEXT,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamAwardNotice_pkey" PRIMARY KEY ("noticeId")
);

-- CreateIndex
CREATE INDEX "SamAwardNotice_postedDate_idx" ON "SamAwardNotice"("postedDate");

-- CreateIndex
CREATE INDEX "SamAwardNotice_awardeeUei_idx" ON "SamAwardNotice"("awardeeUei");

-- CreateIndex
CREATE INDEX "SamAwardNotice_recipientId_idx" ON "SamAwardNotice"("recipientId");

-- CreateIndex
CREATE INDEX "DodAnnouncement_recipientId_idx" ON "DodAnnouncement"("recipientId");

-- CreateIndex
CREATE INDEX "FederalRegisterDoc_programSlug_publishedAt_idx" ON "FederalRegisterDoc"("programSlug", "publishedAt");

-- AddForeignKey
ALTER TABLE "FederalRegisterDoc" ADD CONSTRAINT "FederalRegisterDoc_programSlug_fkey" FOREIGN KEY ("programSlug") REFERENCES "Program"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

