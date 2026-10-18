-- Trigram search (recipient / company / agency names)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('UEI_PARENT_ROLLUP', 'EXACT_NAME', 'ALIAS', 'FUZZY', 'MANUAL');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('USASPENDING', 'DOD_ANNOUNCEMENT', 'SAM_OPPORTUNITY');

-- CreateEnum
CREATE TYPE "AwardCategory" AS ENUM ('CONTRACT', 'IDV', 'GRANT', 'LOAN', 'DIRECT_PAYMENT', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DataView" AS ENUM ('REALTIME', 'DELAYED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateTable
CREATE TABLE "Agency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "SubAgency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agencyCode" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SubAgency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "uei" TEXT,
    "duns" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "parentUei" TEXT,
    "parentName" TEXT,
    "ultimateParentUei" TEXT,
    "recipientType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "stateCode" TEXT,
    "countryCode" TEXT,
    "samLastSyncedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "cik" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "sicCode" TEXT,
    "sector" TEXT,
    "marketCap" DECIMAL(20,2),
    "marketCapAsOf" DATE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("cik")
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "companyCik" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickerMatch" (
    "recipientId" TEXT NOT NULL,
    "companyCik" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TickerMatch_pkey" PRIMARY KEY ("recipientId")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'USASPENDING',
    "displayId" TEXT,
    "category" "AwardCategory" NOT NULL,
    "typeCode" TEXT,
    "description" TEXT,
    "recipientId" TEXT,
    "awardingAgencyCode" TEXT,
    "awardingSubCode" TEXT,
    "fundingAgencyCode" TEXT,
    "naicsCode" TEXT,
    "pscCode" TEXT,
    "assistanceListing" TEXT,
    "defCodes" TEXT[],
    "totalObligated" DECIMAL(20,2) NOT NULL,
    "potentialValue" DECIMAL(20,2),
    "startDate" DATE,
    "endDate" DATE,
    "lastModifiedDate" DATE NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardTransaction" (
    "id" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "modNumber" TEXT,
    "actionDate" DATE NOT NULL,
    "obligation" DECIMAL(20,2) NOT NULL,
    "actionType" TEXT,
    "description" TEXT,
    "availableAt" TIMESTAMPTZ NOT NULL,
    "lastModifiedDate" DATE NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "matchRules" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "AwardProgram" (
    "awardId" TEXT NOT NULL,
    "programSlug" TEXT NOT NULL,

    CONSTRAINT "AwardProgram_pkey" PRIMARY KEY ("awardId","programSlug")
);

-- CreateTable
CREATE TABLE "RecipientAwardMonthly" (
    "recipientId" TEXT NOT NULL,
    "view" "DataView" NOT NULL,
    "month" DATE NOT NULL,
    "obligated" DECIMAL(20,2) NOT NULL,
    "txCount" INTEGER NOT NULL,

    CONSTRAINT "RecipientAwardMonthly_pkey" PRIMARY KEY ("recipientId","view","month")
);

-- CreateTable
CREATE TABLE "CompanyAwardMonthly" (
    "companyCik" TEXT NOT NULL,
    "view" "DataView" NOT NULL,
    "month" DATE NOT NULL,
    "agencyCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "includesPossible" BOOLEAN NOT NULL,
    "obligated" DECIMAL(20,2) NOT NULL,
    "txCount" INTEGER NOT NULL,

    CONSTRAINT "CompanyAwardMonthly_pkey" PRIMARY KEY ("companyCik","view","month","agencyCode","category","includesPossible")
);

-- CreateTable
CREATE TABLE "PriceBar" (
    "companyCik" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(14,4) NOT NULL,
    "high" DECIMAL(14,4) NOT NULL,
    "low" DECIMAL(14,4) NOT NULL,
    "close" DECIMAL(14,4) NOT NULL,
    "volume" BIGINT NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "PriceBar_pkey" PRIMARY KEY ("companyCik","date")
);

-- CreateTable
CREATE TABLE "SecFiling" (
    "accession" TEXT NOT NULL,
    "companyCik" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "filedAt" DATE NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "mentionsAward" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SecFiling_pkey" PRIMARY KEY ("accession")
);

-- CreateTable
CREATE TABLE "FederalRegisterDoc" (
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "agencyNames" TEXT[],
    "publishedAt" DATE NOT NULL,
    "url" TEXT NOT NULL,
    "programSlug" TEXT,

    CONSTRAINT "FederalRegisterDoc_pkey" PRIMARY KEY ("documentNumber")
);

-- CreateTable
CREATE TABLE "DodAnnouncement" (
    "id" TEXT NOT NULL,
    "announcementDate" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "contractorName" TEXT NOT NULL,
    "amount" DECIMAL(20,2),
    "contractNumber" TEXT,
    "recipientId" TEXT,
    "url" TEXT NOT NULL,

    CONSTRAINT "DodAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "chunkKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "RunStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsUpserted" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFreshness" (
    "source" TEXT NOT NULL,
    "lastSuccessfulAt" TIMESTAMPTZ NOT NULL,
    "dataThrough" DATE NOT NULL,

    CONSTRAINT "DataFreshness_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMPTZ,
    "name" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "acceptedDisclaimerAt" TIMESTAMPTZ,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "stripeSubscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trialEndsAt" TIMESTAMPTZ,
    "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("stripeSubscriptionId")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "watchlistId" TEXT NOT NULL,
    "companyCik" TEXT NOT NULL,
    "alertThreshold" DECIMAL(20,2),

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("watchlistId","companyCik")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyCik" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubAgency_agencyCode_idx" ON "SubAgency"("agencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_uei_key" ON "Recipient"("uei");

-- CreateIndex
CREATE INDEX "Recipient_parentUei_idx" ON "Recipient"("parentUei");

-- CreateIndex
CREATE INDEX "Recipient_ultimateParentUei_idx" ON "Recipient"("ultimateParentUei");

-- CreateIndex
CREATE INDEX "Recipient_recipientType_idx" ON "Recipient"("recipientType");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_key" ON "Company"("ticker");

-- CreateIndex
CREATE INDEX "CompanyAlias_normalized_idx" ON "CompanyAlias"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_companyCik_normalized_key" ON "CompanyAlias"("companyCik", "normalized");

-- CreateIndex
CREATE INDEX "TickerMatch_companyCik_status_idx" ON "TickerMatch"("companyCik", "status");

-- CreateIndex
CREATE INDEX "TickerMatch_status_confidence_idx" ON "TickerMatch"("status", "confidence");

-- CreateIndex
CREATE INDEX "Award_recipientId_idx" ON "Award"("recipientId");

-- CreateIndex
CREATE INDEX "Award_awardingAgencyCode_idx" ON "Award"("awardingAgencyCode");

-- CreateIndex
CREATE INDEX "Award_lastModifiedDate_idx" ON "Award"("lastModifiedDate");

-- CreateIndex
CREATE INDEX "Award_assistanceListing_idx" ON "Award"("assistanceListing");

-- CreateIndex
CREATE INDEX "AwardTransaction_awardId_actionDate_idx" ON "AwardTransaction"("awardId", "actionDate");

-- CreateIndex
CREATE INDEX "AwardTransaction_actionDate_idx" ON "AwardTransaction"("actionDate");

-- CreateIndex
CREATE INDEX "AwardTransaction_availableAt_idx" ON "AwardTransaction"("availableAt");

-- CreateIndex
CREATE INDEX "AwardProgram_programSlug_idx" ON "AwardProgram"("programSlug");

-- CreateIndex
CREATE INDEX "RecipientAwardMonthly_view_month_idx" ON "RecipientAwardMonthly"("view", "month");

-- CreateIndex
CREATE INDEX "CompanyAwardMonthly_view_month_idx" ON "CompanyAwardMonthly"("view", "month");

-- CreateIndex
CREATE INDEX "SecFiling_companyCik_filedAt_idx" ON "SecFiling"("companyCik", "filedAt");

-- CreateIndex
CREATE INDEX "FederalRegisterDoc_publishedAt_idx" ON "FederalRegisterDoc"("publishedAt");

-- CreateIndex
CREATE INDEX "DodAnnouncement_announcementDate_idx" ON "DodAnnouncement"("announcementDate");

-- CreateIndex
CREATE INDEX "DodAnnouncement_contractNumber_idx" ON "DodAnnouncement"("contractNumber");

-- CreateIndex
CREATE INDEX "IngestionRun_job_chunkKey_status_idx" ON "IngestionRun"("job", "chunkKey", "status");

-- CreateIndex
CREATE INDEX "IngestionRun_startedAt_idx" ON "IngestionRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Watchlist_userId_idx" ON "Watchlist"("userId");

-- CreateIndex
CREATE INDEX "WatchlistItem_companyCik_idx" ON "WatchlistItem"("companyCik");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_userId_transactionId_key" ON "AlertDelivery"("userId", "transactionId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "SubAgency" ADD CONSTRAINT "SubAgency_agencyCode_fkey" FOREIGN KEY ("agencyCode") REFERENCES "Agency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TickerMatch" ADD CONSTRAINT "TickerMatch_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TickerMatch" ADD CONSTRAINT "TickerMatch_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TickerMatch" ADD CONSTRAINT "TickerMatch_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_awardingAgencyCode_fkey" FOREIGN KEY ("awardingAgencyCode") REFERENCES "Agency"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_awardingSubCode_fkey" FOREIGN KEY ("awardingSubCode") REFERENCES "SubAgency"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_fundingAgencyCode_fkey" FOREIGN KEY ("fundingAgencyCode") REFERENCES "Agency"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardTransaction" ADD CONSTRAINT "AwardTransaction_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardProgram" ADD CONSTRAINT "AwardProgram_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardProgram" ADD CONSTRAINT "AwardProgram_programSlug_fkey" FOREIGN KEY ("programSlug") REFERENCES "Program"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientAwardMonthly" ADD CONSTRAINT "RecipientAwardMonthly_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAwardMonthly" ADD CONSTRAINT "CompanyAwardMonthly_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceBar" ADD CONSTRAINT "PriceBar_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecFiling" ADD CONSTRAINT "SecFiling_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FederalRegisterDoc" ADD CONSTRAINT "FederalRegisterDoc_programSlug_fkey" FOREIGN KEY ("programSlug") REFERENCES "Program"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_companyCik_fkey" FOREIGN KEY ("companyCik") REFERENCES "Company"("cik") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Trigram indexes for fuzzy search and name matching
CREATE INDEX "Recipient_normalizedName_trgm_idx" ON "Recipient" USING GIN ("normalizedName" gin_trgm_ops);
CREATE INDEX "Company_name_trgm_idx" ON "Company" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "CompanyAlias_normalized_trgm_idx" ON "CompanyAlias" USING GIN ("normalized" gin_trgm_ops);
CREATE INDEX "Agency_name_trgm_idx" ON "Agency" USING GIN ("name" gin_trgm_ops);
