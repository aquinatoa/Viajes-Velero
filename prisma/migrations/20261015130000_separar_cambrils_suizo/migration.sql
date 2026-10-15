-- GENERADO por scripts/generar-separar-cambrils-suizo.mjs desde
-- Tarifas 26-27 Oravia/TARIFAS_MSH_2027_DESGLOSE_COSTE-VENTA_SUIZA-GENERAL.xlsx. No editar a mano.
--
-- Separa en sus tres hoteles las 42 tarifas del turoperador suizo de Cambrils
-- Park, que la lectura del PDF juntó en «CAMBRILS PARK-FUTBOL SALOU». El hotel de cada
-- tarifa sale de su precio (venta suiza del Excel de desglose); los bungalós
-- «1 PAX X BUNG», a Villa Bonita. Las tarifas no se tocan: solo cambian de
-- alojamiento. El alojamiento junto se borra si se queda vacío.
CREATE TEMP TABLE juntos AS
SELECT a.*
FROM "Accommodation" a
JOIN "SourceDocument" d ON d."id" = a."sourceDocumentId"
WHERE d."controlName" = 'Fútbol Salou 2027 · venta turoperador suizo' AND a."accommodationName" = 'CAMBRILS PARK-FUTBOL SALOU';

INSERT INTO "Accommodation" ("id", "accommodationName", "locality", "categoryType", "accommodationType",
  "observations", "conditionsText", "freePolicy", "sourceFile", "sourceDocumentId", "sourceStagingId", "createdAt", "updatedAt")
SELECT a."id" || '_med1', 'Mediterrània MED1', a."locality", a."categoryType", a."accommodationType",
  a."observations", a."conditionsText", a."freePolicy", a."sourceFile", a."sourceDocumentId", a."sourceStagingId", NOW(), NOW()
FROM juntos a
WHERE NOT EXISTS (SELECT 1 FROM "Accommodation" x WHERE x."id" = a."id" || '_med1');

INSERT INTO "Accommodation" ("id", "accommodationName", "locality", "categoryType", "accommodationType",
  "observations", "conditionsText", "freePolicy", "sourceFile", "sourceDocumentId", "sourceStagingId", "createdAt", "updatedAt")
SELECT a."id" || '_med23', 'Mediterrània MED2/3', a."locality", a."categoryType", a."accommodationType",
  a."observations", a."conditionsText", a."freePolicy", a."sourceFile", a."sourceDocumentId", a."sourceStagingId", NOW(), NOW()
FROM juntos a
WHERE NOT EXISTS (SELECT 1 FROM "Accommodation" x WHERE x."id" = a."id" || '_med23');

INSERT INTO "Accommodation" ("id", "accommodationName", "locality", "categoryType", "accommodationType",
  "observations", "conditionsText", "freePolicy", "sourceFile", "sourceDocumentId", "sourceStagingId", "createdAt", "updatedAt")
SELECT a."id" || '_vbonita', 'Villa Bonita / Aloha', a."locality", a."categoryType", a."accommodationType",
  a."observations", a."conditionsText", a."freePolicy", a."sourceFile", a."sourceDocumentId", a."sourceStagingId", NOW(), NOW()
FROM juntos a
WHERE NOT EXISTS (SELECT 1 FROM "Accommodation" x WHERE x."id" = a."id" || '_vbonita');

UPDATE "AccommodationRate" r
SET "accommodationId" = j."id" || v.sufijo
FROM juntos j, (VALUES
  ('_med1', 'PC', '%rtificial%', 'DOBLE', 80),
  ('_med1', 'MP', '%rtificial%', 'DOBLE', 75),
  ('_med1', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 113),
  ('_med1', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 108),
  ('_med1', 'PC', '%atural%', 'DOBLE', 92),
  ('_med1', 'MP', '%atural%', 'DOBLE', 88),
  ('_med1', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 125),
  ('_med1', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 121),
  ('_med1', 'PC', '%in campo%', 'DOBLE', 73),
  ('_med1', 'MP', '%in campo%', 'DOBLE', 69),
  ('_med1', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 108),
  ('_med1', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 104),
  ('_med23', 'PC', '%rtificial%', 'DOBLE', 71),
  ('_med23', 'MP', '%rtificial%', 'DOBLE', 66),
  ('_med23', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 88),
  ('_med23', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 83),
  ('_med23', 'PC', '%atural%', 'DOBLE', 83),
  ('_med23', 'MP', '%atural%', 'DOBLE', 79),
  ('_med23', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 100),
  ('_med23', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 96),
  ('_med23', 'PC', '%in campo%', 'DOBLE', 64),
  ('_med23', 'MP', '%in campo%', 'DOBLE', 60),
  ('_med23', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 83),
  ('_med23', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 79),
  ('_vbonita', 'PC', '%rtificial%', 'DOBLE', 66),
  ('_vbonita', 'MP', '%rtificial%', 'DOBLE', 61),
  ('_vbonita', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 83),
  ('_vbonita', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 78),
  ('_vbonita', 'PC', '%atural%', 'DOBLE', 78),
  ('_vbonita', 'MP', '%atural%', 'DOBLE', 74),
  ('_vbonita', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 95),
  ('_vbonita', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 91),
  ('_vbonita', 'PC', '%in campo%', 'DOBLE', 59),
  ('_vbonita', 'MP', '%in campo%', 'DOBLE', 55),
  ('_vbonita', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 78),
  ('_vbonita', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 74)
) AS v(sufijo, regimen, campo, ocupacion, venta)
WHERE r."accommodationId" = j."id"
  AND r."boardType" = v.regimen
  AND r."includedService" ILIKE v.campo
  AND r."occupancyLabel" ~* ('^(' || v.ocupacion || ')$')
  AND round(r."pvpAmount" * 100) = round(v.venta * 100);

UPDATE "AccommodationRate" r
SET "accommodationId" = j."id" || '_vbonita'
FROM juntos j
WHERE r."accommodationId" = j."id" AND r."occupancyLabel" = '1 PAX X BUNG';

DELETE FROM "Accommodation" a
USING juntos j
WHERE a."id" = j."id"
  AND NOT EXISTS (SELECT 1 FROM "AccommodationRate" r WHERE r."accommodationId" = a."id");

DROP TABLE juntos;
