-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('RECEIVED', 'PARSED_WITH_GAPS', 'READY_FOR_SEARCH', 'PROPOSAL_IN_PROGRESS', 'APPROVED', 'CRM_READY');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'READY_FOR_APPROVAL', 'APPROVED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEPT_ADMIN', 'QUOTER', 'USER');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('GROUPS', 'SPORTS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'SIMULATED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isReturningCustomer" BOOLEAN NOT NULL DEFAULT false,
    "crmContactId" TEXT,
    "crmAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "department" "Department",
    "opportunityName" TEXT,
    "originalMessage" TEXT NOT NULL,
    "language" TEXT,
    "destinationText" TEXT,
    "destinationCountry" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "participants" INTEGER,
    "teachers" INTEGER,
    "ageRangeText" TEXT,
    "averageAgeText" TEXT,
    "groupType" TEXT,
    "regimeRequested" TEXT,
    "categoryRequested" TEXT,
    "requirementsText" TEXT,
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "crmDealId" TEXT,
    "crmDealUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accommodation" (
    "id" TEXT NOT NULL,
    "accommodationName" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "categoryType" TEXT,
    "accommodationType" TEXT,
    "observations" TEXT,
    "conditionsText" TEXT,
    "freePolicy" TEXT,
    "sourceFile" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationPolicy" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "policyType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "policyText" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "AccommodationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationAdjustment" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "concept" TEXT NOT NULL,
    "amountType" TEXT,
    "amount" DECIMAL(65,30),
    "appliesPer" TEXT,
    "conditionText" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "AccommodationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationBlackoutDate" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "availabilityStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "reason" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "AccommodationBlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccommodationRate" (
    "id" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "rateSource" TEXT,
    "year" INTEGER NOT NULL,
    "seasonName" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "minNights" INTEGER,
    "boardType" TEXT,
    "tariffUnit" TEXT,
    "currency" TEXT,
    "pvpAmount" DECIMAL(65,30),
    "netSaleAmount" DECIMAL(65,30),
    "netAzulmarinoAmount" DECIMAL(65,30),
    "clientSegment" TEXT,
    "includedService" TEXT,
    "occupancyLabel" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "AccommodationRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "supplierName" TEXT,
    "locationMain" TEXT,
    "durationText" TEXT,
    "descriptionText" TEXT,
    "sourceFile" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRate" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ageLabel" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "currency" TEXT,
    "salePvpAmount" DECIMAL(65,30),
    "costNetAmount" DECIMAL(65,30),
    "commissionPercent" DECIMAL(65,30),
    "clientSegment" TEXT,
    "durationText" TEXT,
    "sourceFile" TEXT,
    "sourceSheet" TEXT,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "ActivityRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripProposal" (
    "id" TEXT NOT NULL,
    "tripRequestId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "proposalStatus" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedOptionNumber" INTEGER,
    "summaryText" TEXT,
    "crmPayloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalAccommodationOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "accommodationId" TEXT NOT NULL,
    "optionNumber" INTEGER NOT NULL,
    "accommodationNameSnapshot" TEXT,
    "boardType" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "nights" INTEGER,
    "participants" INTEGER,
    "teachers" INTEGER,
    "totalPvpText" TEXT,
    "priceBreakdownText" TEXT,
    "conditionsText" TEXT,
    "observationsText" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProposalAccommodationOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalActivityOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "optionNumber" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL,
    "activityNameSnapshot" TEXT NOT NULL,
    "providerSnapshot" TEXT,
    "durationSnapshot" TEXT,
    "pvpSnapshot" TEXT,
    "descriptionSnapshot" TEXT,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProposalActivityOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSyncLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "requestPayload" TEXT,
    "responsePayload" TEXT,
    "syncStatus" "SyncStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'SOURCE',
    "targetType" TEXT NOT NULL,
    "originalFileName" TEXT,
    "storedFilePath" TEXT,
    "fileMimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "fileHash" TEXT,
    "controlName" TEXT NOT NULL,
    "controlLocation" TEXT,
    "controlYear" INTEGER,
    "controlCategory" TEXT,
    "controlNotes" TEXT,
    "rateKind" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "marginPercent" DECIMAL(65,30),
    "clientSegment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "extractionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "requiresOcr" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DECIMAL(65,30),
    "aiInputTokens" INTEGER,
    "aiOutputTokens" INTEGER,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "extractionMethod" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "rawText" TEXT,
    "rawJson" JSONB,
    "confidenceScore" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fieldName" TEXT,
    "rawValue" TEXT,
    "pageNumber" INTEGER,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingAccommodation" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "accommodationName" TEXT NOT NULL,
    "providerName" TEXT,
    "locality" TEXT,
    "province" TEXT,
    "country" TEXT,
    "categoryType" TEXT,
    "accommodationType" TEXT,
    "confidenceScore" DECIMAL(65,30),
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "assignmentConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagingAccommodation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingAccommodationRate" (
    "id" TEXT NOT NULL,
    "stagingAccommodationId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "seasonName" TEXT,
    "year" INTEGER,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "boardType" TEXT,
    "unitName" TEXT,
    "unitType" TEXT,
    "rateUnit" TEXT,
    "occupancyLabel" TEXT,
    "includedService" TEXT,
    "minNights" INTEGER,
    "minPax" INTEGER,
    "minUnits" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxIncluded" BOOLEAN,
    "pvpAmount" DECIMAL(65,30),
    "netAmount" DECIMAL(65,30),
    "costAmount" DECIMAL(65,30),
    "commissionPercent" DECIMAL(65,30),
    "rawText" TEXT,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingAccommodationRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingAccommodationAdjustment" (
    "id" TEXT NOT NULL,
    "stagingAccommodationId" TEXT NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amountType" TEXT,
    "amount" DECIMAL(65,30),
    "appliesPer" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "conditionText" TEXT,
    "rawText" TEXT,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingAccommodationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingAccommodationPolicy" (
    "id" TEXT NOT NULL,
    "stagingAccommodationId" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "policyText" TEXT NOT NULL,
    "structuredJson" JSONB,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingAccommodationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingAccommodationBlackoutDate" (
    "id" TEXT NOT NULL,
    "stagingAccommodationId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "availabilityStatus" TEXT NOT NULL,
    "reason" TEXT,
    "rawText" TEXT,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingAccommodationBlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingActivity" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "supplierName" TEXT,
    "locationMain" TEXT,
    "province" TEXT,
    "country" TEXT,
    "activityType" TEXT,
    "durationText" TEXT,
    "descriptionText" TEXT,
    "confidenceScore" DECIMAL(65,30),
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StagingActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingActivityRate" (
    "id" TEXT NOT NULL,
    "stagingActivityId" TEXT NOT NULL,
    "year" INTEGER,
    "seasonName" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "ageLabel" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "rateUnit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "salePvpAmount" DECIMAL(65,30),
    "costNetAmount" DECIMAL(65,30),
    "commissionPercent" DECIMAL(65,30),
    "minPax" INTEGER,
    "maxPax" INTEGER,
    "durationText" TEXT,
    "rawText" TEXT,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingActivityRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagingActivityPolicy" (
    "id" TEXT NOT NULL,
    "stagingActivityId" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "policyText" TEXT NOT NULL,
    "structuredJson" JSONB,
    "sourcePage" INTEGER,
    "confidenceScore" DECIMAL(65,30),
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "StagingActivityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "department" "Department",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalDelivery" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "department" "Department",
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "replyToEmail" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "pdfPath" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentByUserId" TEXT,
    "publicToken" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "chosenOptionNumber" INTEGER,
    "chosenAt" TIMESTAMP(3),
    "depositDueAt" TIMESTAMP(3),
    "depositPaidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProposalDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE INDEX "TripRequest_crmDealId_idx" ON "TripRequest"("crmDealId");

-- CreateIndex
CREATE INDEX "Accommodation_sourceDocumentId_idx" ON "Accommodation"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "AccommodationPolicy_accommodationId_idx" ON "AccommodationPolicy"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationPolicy_sourceDocumentId_idx" ON "AccommodationPolicy"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "AccommodationAdjustment_accommodationId_idx" ON "AccommodationAdjustment"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationAdjustment_sourceDocumentId_idx" ON "AccommodationAdjustment"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "AccommodationBlackoutDate_accommodationId_idx" ON "AccommodationBlackoutDate"("accommodationId");

-- CreateIndex
CREATE INDEX "AccommodationBlackoutDate_sourceDocumentId_idx" ON "AccommodationBlackoutDate"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "AccommodationRate_sourceDocumentId_idx" ON "AccommodationRate"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "Activity_sourceDocumentId_idx" ON "Activity"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ActivityRate_sourceDocumentId_idx" ON "ActivityRate"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "DocumentExtraction_sourceDocumentId_idx" ON "DocumentExtraction"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ImportIssue_sourceDocumentId_idx" ON "ImportIssue"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "ImportIssue_severity_idx" ON "ImportIssue"("severity");

-- CreateIndex
CREATE INDEX "ImportIssue_resolved_idx" ON "ImportIssue"("resolved");

-- CreateIndex
CREATE INDEX "StagingAccommodation_sourceDocumentId_idx" ON "StagingAccommodation"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "StagingAccommodation_accommodationName_idx" ON "StagingAccommodation"("accommodationName");

-- CreateIndex
CREATE INDEX "StagingAccommodation_locality_idx" ON "StagingAccommodation"("locality");

-- CreateIndex
CREATE INDEX "StagingAccommodation_reviewStatus_idx" ON "StagingAccommodation"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingAccommodationRate_stagingAccommodationId_idx" ON "StagingAccommodationRate"("stagingAccommodationId");

-- CreateIndex
CREATE INDEX "StagingAccommodationRate_sourceDocumentId_idx" ON "StagingAccommodationRate"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "StagingAccommodationRate_year_idx" ON "StagingAccommodationRate"("year");

-- CreateIndex
CREATE INDEX "StagingAccommodationRate_dateFrom_dateTo_idx" ON "StagingAccommodationRate"("dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "StagingAccommodationRate_reviewStatus_idx" ON "StagingAccommodationRate"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingAccommodationAdjustment_stagingAccommodationId_idx" ON "StagingAccommodationAdjustment"("stagingAccommodationId");

-- CreateIndex
CREATE INDEX "StagingAccommodationAdjustment_adjustmentType_idx" ON "StagingAccommodationAdjustment"("adjustmentType");

-- CreateIndex
CREATE INDEX "StagingAccommodationAdjustment_reviewStatus_idx" ON "StagingAccommodationAdjustment"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingAccommodationPolicy_stagingAccommodationId_idx" ON "StagingAccommodationPolicy"("stagingAccommodationId");

-- CreateIndex
CREATE INDEX "StagingAccommodationPolicy_policyType_idx" ON "StagingAccommodationPolicy"("policyType");

-- CreateIndex
CREATE INDEX "StagingAccommodationPolicy_reviewStatus_idx" ON "StagingAccommodationPolicy"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingAccommodationBlackoutDate_stagingAccommodationId_idx" ON "StagingAccommodationBlackoutDate"("stagingAccommodationId");

-- CreateIndex
CREATE INDEX "StagingAccommodationBlackoutDate_dateFrom_dateTo_idx" ON "StagingAccommodationBlackoutDate"("dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "StagingAccommodationBlackoutDate_availabilityStatus_idx" ON "StagingAccommodationBlackoutDate"("availabilityStatus");

-- CreateIndex
CREATE INDEX "StagingAccommodationBlackoutDate_reviewStatus_idx" ON "StagingAccommodationBlackoutDate"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingActivity_sourceDocumentId_idx" ON "StagingActivity"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "StagingActivity_activityName_idx" ON "StagingActivity"("activityName");

-- CreateIndex
CREATE INDEX "StagingActivity_supplierName_idx" ON "StagingActivity"("supplierName");

-- CreateIndex
CREATE INDEX "StagingActivity_locationMain_idx" ON "StagingActivity"("locationMain");

-- CreateIndex
CREATE INDEX "StagingActivity_reviewStatus_idx" ON "StagingActivity"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingActivityRate_stagingActivityId_idx" ON "StagingActivityRate"("stagingActivityId");

-- CreateIndex
CREATE INDEX "StagingActivityRate_year_idx" ON "StagingActivityRate"("year");

-- CreateIndex
CREATE INDEX "StagingActivityRate_dateFrom_dateTo_idx" ON "StagingActivityRate"("dateFrom", "dateTo");

-- CreateIndex
CREATE INDEX "StagingActivityRate_reviewStatus_idx" ON "StagingActivityRate"("reviewStatus");

-- CreateIndex
CREATE INDEX "StagingActivityPolicy_stagingActivityId_idx" ON "StagingActivityPolicy"("stagingActivityId");

-- CreateIndex
CREATE INDEX "StagingActivityPolicy_policyType_idx" ON "StagingActivityPolicy"("policyType");

-- CreateIndex
CREATE INDEX "StagingActivityPolicy_reviewStatus_idx" ON "StagingActivityPolicy"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_token_key" ON "AuthToken"("token");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "AuthToken"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDelivery_reference_key" ON "ProposalDelivery"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDelivery_publicToken_key" ON "ProposalDelivery"("publicToken");

-- CreateIndex
CREATE INDEX "ProposalDelivery_proposalId_idx" ON "ProposalDelivery"("proposalId");

-- CreateIndex
CREATE INDEX "ProposalDelivery_status_idx" ON "ProposalDelivery"("status");

-- CreateIndex
CREATE INDEX "ProposalDelivery_depositDueAt_idx" ON "ProposalDelivery"("depositDueAt");

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationPolicy" ADD CONSTRAINT "AccommodationPolicy_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationAdjustment" ADD CONSTRAINT "AccommodationAdjustment_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationBlackoutDate" ADD CONSTRAINT "AccommodationBlackoutDate_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccommodationRate" ADD CONSTRAINT "AccommodationRate_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRate" ADD CONSTRAINT "ActivityRate_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripProposal" ADD CONSTRAINT "TripProposal_tripRequestId_fkey" FOREIGN KEY ("tripRequestId") REFERENCES "TripRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAccommodationOption" ADD CONSTRAINT "ProposalAccommodationOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TripProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalAccommodationOption" ADD CONSTRAINT "ProposalAccommodationOption_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalActivityOption" ADD CONSTRAINT "ProposalActivityOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TripProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalActivityOption" ADD CONSTRAINT "ProposalActivityOption_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingAccommodation" ADD CONSTRAINT "StagingAccommodation_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingAccommodationRate" ADD CONSTRAINT "StagingAccommodationRate_stagingAccommodationId_fkey" FOREIGN KEY ("stagingAccommodationId") REFERENCES "StagingAccommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingAccommodationAdjustment" ADD CONSTRAINT "StagingAccommodationAdjustment_stagingAccommodationId_fkey" FOREIGN KEY ("stagingAccommodationId") REFERENCES "StagingAccommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingAccommodationPolicy" ADD CONSTRAINT "StagingAccommodationPolicy_stagingAccommodationId_fkey" FOREIGN KEY ("stagingAccommodationId") REFERENCES "StagingAccommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingAccommodationBlackoutDate" ADD CONSTRAINT "StagingAccommodationBlackoutDate_stagingAccommodationId_fkey" FOREIGN KEY ("stagingAccommodationId") REFERENCES "StagingAccommodation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingActivity" ADD CONSTRAINT "StagingActivity_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingActivityRate" ADD CONSTRAINT "StagingActivityRate_stagingActivityId_fkey" FOREIGN KEY ("stagingActivityId") REFERENCES "StagingActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagingActivityPolicy" ADD CONSTRAINT "StagingActivityPolicy_stagingActivityId_fkey" FOREIGN KEY ("stagingActivityId") REFERENCES "StagingActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalDelivery" ADD CONSTRAINT "ProposalDelivery_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TripProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
