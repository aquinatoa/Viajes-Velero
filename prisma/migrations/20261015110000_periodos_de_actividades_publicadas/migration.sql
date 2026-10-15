-- Los periodos de las actividades que ya están publicadas.
--
-- La plantilla de actividades v2 se leyó y publicó antes de que existieran los
-- periodos (15/10/2026). Volver a leerla borraría la revisión que hizo Ruth el
-- 07/10, y volver a publicarla cambiaría los identificadores de las
-- actividades. Así que se ponen los periodos sobre lo que hay, en revisión y
-- en el catálogo, conservando ids y estado de revisión. Es la misma regla que
-- aplica ahora la lectura (`leerPeriodos`), para los dos textos que la
-- plantilla v2 escribe así:
--
--   «Del 01/05/2027 al 31/10/2027»        → un periodo (3 tarifas).
--   «2027 (excepto julio y agosto)»       → dos: 1/1–30/6 y 1/9–31/12 (21).
--
-- Solo toca tarifas sin fechas, así que volver a ejecutarla no hace nada.

-- 1 · El rango fijo.
UPDATE "StagingActivityRate"
SET "dateFrom" = DATE '2027-05-01', "dateTo" = DATE '2027-10-31'
WHERE "seasonName" = 'Del 01/05/2027 al 31/10/2027'
  AND "dateFrom" IS NULL AND "dateTo" IS NULL;

UPDATE "ActivityRate" r
SET "seasonName" = s."seasonName", "dateFrom" = s."dateFrom", "dateTo" = s."dateTo"
FROM "StagingActivityRate" s
WHERE r."sourceStagingId" = s."id"
  AND s."seasonName" = 'Del 01/05/2027 al 31/10/2027'
  AND r."dateFrom" IS NULL AND r."dateTo" IS NULL;

-- 2 · «excepto julio y agosto»: la tarifa original se queda con el primer
-- periodo y una copia, con el mismo estado de revisión, con el segundo.
INSERT INTO "StagingActivityRate" (
  "id", "stagingActivityId", "year", "seasonName", "dateFrom", "dateTo",
  "ageLabel", "ageMin", "ageMax", "rateUnit", "currency", "salePvpAmount",
  "costNetAmount", "commissionPercent", "minPax", "maxPax", "durationText",
  "rawText", "sourcePage", "confidenceScore", "requiresReview", "reviewStatus"
)
SELECT
  s."id" || '_p2', s."stagingActivityId", s."year", s."seasonName",
  make_date(s."year", 9, 1), make_date(s."year", 12, 31),
  s."ageLabel", s."ageMin", s."ageMax", s."rateUnit", s."currency", s."salePvpAmount",
  s."costNetAmount", s."commissionPercent", s."minPax", s."maxPax", s."durationText",
  s."rawText", s."sourcePage", s."confidenceScore", s."requiresReview", s."reviewStatus"
FROM "StagingActivityRate" s
WHERE s."seasonName" ILIKE '%excepto julio y agosto%'
  AND s."year" IS NOT NULL
  AND s."dateFrom" IS NULL AND s."dateTo" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "StagingActivityRate" x WHERE x."id" = s."id" || '_p2');

INSERT INTO "ActivityRate" (
  "id", "activityId", "year", "ageLabel", "ageMin", "ageMax", "currency",
  "salePvpAmount", "costNetAmount", "commissionPercent", "clientSegment",
  "durationText", "sourceFile", "sourceSheet", "sourceDocumentId",
  "sourceStagingId", "seasonName", "dateFrom", "dateTo"
)
SELECT
  r."id" || '_p2', r."activityId", r."year", r."ageLabel", r."ageMin", r."ageMax", r."currency",
  r."salePvpAmount", r."costNetAmount", r."commissionPercent", r."clientSegment",
  r."durationText", r."sourceFile", r."sourceSheet", r."sourceDocumentId",
  r."sourceStagingId" || '_p2', s."seasonName",
  make_date(s."year", 9, 1), make_date(s."year", 12, 31)
FROM "ActivityRate" r
JOIN "StagingActivityRate" s ON s."id" = r."sourceStagingId"
WHERE s."seasonName" ILIKE '%excepto julio y agosto%'
  AND s."year" IS NOT NULL
  AND r."dateFrom" IS NULL AND r."dateTo" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ActivityRate" x WHERE x."id" = r."id" || '_p2');

UPDATE "StagingActivityRate"
SET "dateFrom" = make_date("year", 1, 1), "dateTo" = make_date("year", 6, 30)
WHERE "seasonName" ILIKE '%excepto julio y agosto%'
  AND "year" IS NOT NULL
  AND "dateFrom" IS NULL AND "dateTo" IS NULL;

UPDATE "ActivityRate" r
SET "seasonName" = s."seasonName", "dateFrom" = make_date(s."year", 1, 1), "dateTo" = make_date(s."year", 6, 30)
FROM "StagingActivityRate" s
WHERE r."sourceStagingId" = s."id"
  AND s."seasonName" ILIKE '%excepto julio y agosto%'
  AND s."year" IS NOT NULL
  AND r."dateFrom" IS NULL AND r."dateTo" IS NULL;
