
-- CreateTable
CREATE TABLE "ProgramSummary" (
    "programSlug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "publicCompanies" INTEGER NOT NULL,

    CONSTRAINT "ProgramSummary_pkey" PRIMARY KEY ("programSlug","plan")
);

-- CreateTable
CREATE TABLE "AssistanceListing" (
    "number" TEXT NOT NULL,
    "title" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AssistanceListing_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "AssistanceListingSummary" (
    "number" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "total" DECIMAL(20,2) NOT NULL,
    "publicTotal" DECIMAL(20,2) NOT NULL,
    "awards" INTEGER NOT NULL,
    "recipients" INTEGER NOT NULL,
    "publicCompanies" INTEGER NOT NULL,
    "latestAction" DATE,
    "agencyCode" TEXT,

    CONSTRAINT "AssistanceListingSummary_pkey" PRIMARY KEY ("number","plan")
);

-- CreateIndex
CREATE INDEX "AssistanceListing_title_trgm_idx" ON "AssistanceListing" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "AssistanceListingSummary_plan_total_idx" ON "AssistanceListingSummary"("plan", "total");

-- AddForeignKey
ALTER TABLE "ProgramSummary" ADD CONSTRAINT "ProgramSummary_programSlug_fkey" FOREIGN KEY ("programSlug") REFERENCES "Program"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistanceListingSummary" ADD CONSTRAINT "AssistanceListingSummary_number_fkey" FOREIGN KEY ("number") REFERENCES "AssistanceListing"("number") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing awards' programs (titles arrive with the next loads that include them).
INSERT INTO "AssistanceListing" ("number", "updatedAt")
SELECT DISTINCT "assistanceListing", now() FROM "Award" WHERE "assistanceListing" IS NOT NULL
ON CONFLICT DO NOTHING;
