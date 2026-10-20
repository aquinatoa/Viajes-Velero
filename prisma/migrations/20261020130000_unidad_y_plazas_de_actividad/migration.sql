-- La unidad y las plazas de cada tarifa de actividad, que la revisión ya tenía.
ALTER TABLE "ActivityRate" ADD COLUMN "rateUnit" TEXT;
ALTER TABLE "ActivityRate" ADD COLUMN "minPax" INTEGER;
ALTER TABLE "ActivityRate" ADD COLUMN "maxPax" INTEGER;

-- Rellenar desde la revisión ya hecha: por la fila de origen cuando se guardó…
UPDATE "ActivityRate" r
SET "rateUnit" = s."rateUnit", "minPax" = s."minPax", "maxPax" = s."maxPax"
FROM "StagingActivityRate" s
WHERE r."sourceStagingId" = s."id";

-- …y, si no, por actividad, etiqueta y precio.
UPDATE "ActivityRate" r
SET "rateUnit" = s."rateUnit", "minPax" = s."minPax", "maxPax" = s."maxPax"
FROM "StagingActivityRate" s
JOIN "StagingActivity" sa ON sa."id" = s."stagingActivityId"
JOIN "Activity" a ON a."activityName" = sa."activityName"
WHERE r."activityId" = a."id"
  AND r."rateUnit" IS NULL
  AND COALESCE(r."ageLabel", '') = COALESCE(s."ageLabel", '')
  AND r."salePvpAmount" = s."salePvpAmount";
