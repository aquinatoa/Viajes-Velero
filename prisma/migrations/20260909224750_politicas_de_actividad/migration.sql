-- CreateTable
CREATE TABLE "ActivityPolicy" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "policyType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "policyText" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "sourceStagingId" TEXT,

    CONSTRAINT "ActivityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityPolicy_activityId_idx" ON "ActivityPolicy"("activityId");

-- CreateIndex
CREATE INDEX "ActivityPolicy_sourceDocumentId_idx" ON "ActivityPolicy"("sourceDocumentId");

-- AddForeignKey
ALTER TABLE "ActivityPolicy" ADD CONSTRAINT "ActivityPolicy_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
