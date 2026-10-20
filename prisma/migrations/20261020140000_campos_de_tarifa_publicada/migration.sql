-- Lo que la revisión ya tenía de cada tarifa de hotel y no llegaba a la publicada.
ALTER TABLE "AccommodationRate" ADD COLUMN "unitName" TEXT;
ALTER TABLE "AccommodationRate" ADD COLUMN "minPax" INTEGER;
ALTER TABLE "AccommodationRate" ADD COLUMN "rawText" TEXT;

-- Rellenar desde la revisión ya hecha: por la fila de origen cuando se guardó…
UPDATE "AccommodationRate" r
SET "unitName" = s."unitName", "minPax" = s."minPax", "rawText" = s."rawText"
FROM "StagingAccommodationRate" s
WHERE r."sourceStagingId" = s."id";

-- …y, si no, por hotel, temporada, régimen, ocupación y precio.
UPDATE "AccommodationRate" r
SET "unitName" = s."unitName", "minPax" = s."minPax", "rawText" = s."rawText"
FROM "StagingAccommodationRate" s
JOIN "StagingAccommodation" sa ON sa."id" = s."stagingAccommodationId"
JOIN "Accommodation" a ON a."accommodationName" = sa."accommodationName"
WHERE r."accommodationId" = a."id"
  AND r."unitName" IS NULL AND r."rawText" IS NULL
  AND COALESCE(r."seasonName", '') = COALESCE(s."seasonName", '')
  AND COALESCE(r."boardType", '') = COALESCE(s."boardType", '')
  AND COALESCE(r."occupancyLabel", '') = COALESCE(s."occupancyLabel", '')
  AND COALESCE(r."minNights", 0) = COALESCE(s."minNights", 0)
  AND r."pvpAmount" = COALESCE(s."pvpAmount", s."netAmount");
