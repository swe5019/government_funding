-- CreateIndex
CREATE INDEX "Award_naicsCode_idx" ON "Award"("naicsCode");

-- CreateIndex
CREATE INDEX "Award_defCodes_idx" ON "Award" USING GIN ("defCodes");
