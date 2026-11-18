-- Cambrils Park como UN complejo con cuatro tipos de alojamiento (Javier, 17/11/2026).
--
-- «Cuando buscamos alojamiento, tiene que salir CAMBRILS PARK y después tiene
-- que haber la opción de MED 1 / MED 2 / MED 3 / VILLA BONITA-ALOHA.» Y: «MED 2
-- son dos habitaciones y MED 3 son 3 habitaciones; aunque el precio por pax es
-- el mismo, para el total es diferente.» El «Bungalow» del Excel de suizos es
-- Villa Bonita / Aloha (sus tarifas 1 PAX X BUNG ya están ahí desde la
-- migración 20261015130000_separar_cambrils_suizo).
--
-- Cada tipo sigue siendo su propio alojamiento, con su nombre «Cambrils Park ·
-- <tipo>»: así cada uno se puede ofrecer como opción de una propuesta y la
-- estancia no mezcla precios de un tipo con los de otro. La lista del
-- cotizador los agrupa bajo «Cambrils Park» (src/domain/complejoDeAlojamiento.ts).
--
-- Lo hace en los dos canales: «Fútbol Salou 2027 · venta general» y
-- «Fútbol Salou 2027 · venta turoperador suizo».
--   · «Mediterrània MED1»     → «Cambrils Park · MED 1»
--   · «Mediterrània MED2/3»   → «Cambrils Park · MED 2»
--   · copia de MED2/3, con sus tarifas, políticas, suplementos y fechas
--                             → «Cambrils Park · MED 3»   (id del original + «_med3»)
--   · «Villa Bonita / Aloha»  → «Cambrils Park · Villa Bonita / Aloha»
-- Los identificadores no cambian: las propuestas ya hechas siguen enlazadas a
-- su alojamiento y guardan su nombre de entonces. Ningún precio cambia (los dos
-- Excel del 10/11 traen los mismos que lo publicado; comprobado el 18/11).
-- Se puede ejecutar dos veces: la copia comprueba que no exista y el cambio de
-- nombre solo toca los nombres viejos.

CREATE TEMP TABLE cp_docs AS
SELECT d."id"
FROM "SourceDocument" d
WHERE d."controlName" IN ('Fútbol Salou 2027 · venta general', 'Fútbol Salou 2027 · venta turoperador suizo');

CREATE TEMP TABLE cp_med23 AS
SELECT a.*
FROM "Accommodation" a
WHERE a."sourceDocumentId" IN (SELECT "id" FROM cp_docs)
  AND a."accommodationName" = 'Mediterrània MED2/3';

-- 1 · MED 3: copia de MED2/3 con todo lo suyo.
INSERT INTO "Accommodation" ("id", "accommodationName", "locality", "categoryType", "accommodationType",
  "observations", "conditionsText", "freePolicy", "sourceFile", "sourceDocumentId", "sourceStagingId", "createdAt", "updatedAt")
SELECT a."id" || '_med3', 'Cambrils Park · MED 3', a."locality", a."categoryType", a."accommodationType",
  a."observations", a."conditionsText", a."freePolicy", a."sourceFile", a."sourceDocumentId", a."sourceStagingId", NOW(), NOW()
FROM cp_med23 a
WHERE NOT EXISTS (SELECT 1 FROM "Accommodation" x WHERE x."id" = a."id" || '_med3');

INSERT INTO "AccommodationRate" ("id", "accommodationId", "rateSource", "year", "seasonName", "dateFrom", "dateTo",
  "minNights", "boardType", "tariffUnit", "currency", "pvpAmount", "netSaleAmount", "netAzulmarinoAmount",
  "clientSegment", "includedService", "occupancyLabel", "unitName", "minPax", "rawText",
  "sourceFile", "sourceSheet", "sourceDocumentId", "sourceStagingId")
SELECT r."id" || '_med3', r."accommodationId" || '_med3', r."rateSource", r."year", r."seasonName", r."dateFrom", r."dateTo",
  r."minNights", r."boardType", r."tariffUnit", r."currency", r."pvpAmount", r."netSaleAmount", r."netAzulmarinoAmount",
  r."clientSegment", r."includedService", r."occupancyLabel", r."unitName", r."minPax", r."rawText",
  r."sourceFile", r."sourceSheet", r."sourceDocumentId", r."sourceStagingId"
FROM "AccommodationRate" r
JOIN cp_med23 a ON a."id" = r."accommodationId"
WHERE NOT EXISTS (SELECT 1 FROM "AccommodationRate" x WHERE x."id" = r."id" || '_med3');

INSERT INTO "AccommodationPolicy" ("id", "accommodationId", "policyType", "policyText", "sourceDocumentId", "sourceStagingId")
SELECT p."id" || '_med3', p."accommodationId" || '_med3', p."policyType", p."policyText", p."sourceDocumentId", p."sourceStagingId"
FROM "AccommodationPolicy" p
JOIN cp_med23 a ON a."id" = p."accommodationId"
WHERE NOT EXISTS (SELECT 1 FROM "AccommodationPolicy" x WHERE x."id" = p."id" || '_med3');

INSERT INTO "AccommodationAdjustment" ("id", "accommodationId", "adjustmentType", "concept", "amountType", "amount",
  "appliesPer", "conditionText", "sourceDocumentId", "sourceStagingId")
SELECT j."id" || '_med3', j."accommodationId" || '_med3', j."adjustmentType", j."concept", j."amountType", j."amount",
  j."appliesPer", j."conditionText", j."sourceDocumentId", j."sourceStagingId"
FROM "AccommodationAdjustment" j
JOIN cp_med23 a ON a."id" = j."accommodationId"
WHERE NOT EXISTS (SELECT 1 FROM "AccommodationAdjustment" x WHERE x."id" = j."id" || '_med3');

INSERT INTO "AccommodationBlackoutDate" ("id", "accommodationId", "dateFrom", "dateTo", "availabilityStatus", "reason",
  "sourceDocumentId", "sourceStagingId")
SELECT b."id" || '_med3', b."accommodationId" || '_med3', b."dateFrom", b."dateTo", b."availabilityStatus", b."reason",
  b."sourceDocumentId", b."sourceStagingId"
FROM "AccommodationBlackoutDate" b
JOIN cp_med23 a ON a."id" = b."accommodationId"
WHERE NOT EXISTS (SELECT 1 FROM "AccommodationBlackoutDate" x WHERE x."id" = b."id" || '_med3');

-- 2 · Los nombres: todos bajo «Cambrils Park».
UPDATE "Accommodation" a
SET "accommodationName" = n.nuevo, "updatedAt" = NOW()
FROM (VALUES
  ('Mediterrània MED1', 'Cambrils Park · MED 1'),
  ('Mediterrània MED2/3', 'Cambrils Park · MED 2'),
  ('Villa Bonita / Aloha', 'Cambrils Park · Villa Bonita / Aloha')
) AS n(viejo, nuevo)
WHERE a."sourceDocumentId" IN (SELECT "id" FROM cp_docs)
  AND a."accommodationName" = n.viejo;

DROP TABLE cp_med23;
DROP TABLE cp_docs;
