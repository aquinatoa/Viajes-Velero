-- CreateTable
CREATE TABLE "RequestDraft" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "department" "Department",
    "payload" TEXT NOT NULL,
    "tripRequestId" TEXT,
    "lockedByUserId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequestDraft_ownerUserId_idx" ON "RequestDraft"("ownerUserId");

-- CreateIndex
CREATE INDEX "RequestDraft_department_idx" ON "RequestDraft"("department");

-- CreateIndex
CREATE INDEX "RequestDraft_updatedAt_idx" ON "RequestDraft"("updatedAt");
