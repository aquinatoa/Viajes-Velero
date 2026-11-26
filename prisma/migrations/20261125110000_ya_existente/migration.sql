-- 25/11/2026 · «Ya existente»: al volver a subir un documento, lo que ya está
-- publicado igual queda aprobado y marcado (Ruth, 24/11/2026).
ALTER TABLE "StagingAccommodation" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingAccommodationRate" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingAccommodationAdjustment" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingAccommodationPolicy" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingAccommodationBlackoutDate" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingActivity" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingActivityRate" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StagingActivityPolicy" ADD COLUMN IF NOT EXISTS "yaExistente" BOOLEAN NOT NULL DEFAULT false;
