-- DropForeignKey
ALTER TABLE "ProposalAccommodationOption" DROP CONSTRAINT "ProposalAccommodationOption_accommodationId_fkey";

-- DropForeignKey
ALTER TABLE "ProposalActivityOption" DROP CONSTRAINT "ProposalActivityOption_activityId_fkey";

-- AlterTable
ALTER TABLE "ProposalAccommodationOption" ALTER COLUMN "accommodationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ProposalActivityOption" ALTER COLUMN "activityId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ProposalAccommodationOption" ADD CONSTRAINT "ProposalAccommodationOption_accommodationId_fkey" FOREIGN KEY ("accommodationId") REFERENCES "Accommodation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalActivityOption" ADD CONSTRAINT "ProposalActivityOption_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

