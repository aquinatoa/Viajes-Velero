-- GENERADO por scripts/generar-costes-futbol.mjs desde
-- Tarifas 26-27 Oravia/TARIFAS_MSH_2027_DESGLOSE_COSTE-VENTA_SUIZA-GENERAL.xlsx. No editar a mano.
--
-- El coste de las tarifas de fútbol publicadas, que se cargaron de los PDF
-- de venta y no lo traían. Se pone solo donde la venta publicada coincide con
-- la del Excel y el coste está vacío. Esperado: 36 de la venta general y 36
-- de la suiza; el alojamiento y desayuno y los bungalós se quedan sin coste
-- porque el Excel no los trae.
UPDATE "AccommodationRate" r
SET "netSaleAmount" = v.coste
FROM "Accommodation" a, "SourceDocument" d, (VALUES
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%rtificial%', 'DOBLE', 88, 79),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'DOBLE', 80, 79),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%rtificial%', 'DOBLE', 83, 74),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'DOBLE', 75, 74),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 125, 112),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 113, 112),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 120, 107),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 108, 107),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%atural%', 'DOBLE', 102, 91),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'DOBLE', 92, 91),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%atural%', 'DOBLE', 97, 87),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'DOBLE', 88, 87),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 139, 124),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 125, 124),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 134, 120),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 121, 120),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%in campo%', 'DOBLE', 81, 72),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'DOBLE', 73, 72),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%in campo%', 'DOBLE', 76, 68),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'DOBLE', 69, 68),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 120, 107),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 108, 107),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED1', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 115, 103),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 104, 103),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%rtificial%', 'DOBLE', 78, 70),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'DOBLE', 71, 70),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%rtificial%', 'DOBLE', 73, 65),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'DOBLE', 66, 65),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 97, 87),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 88, 87),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 92, 82),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 83, 82),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%atural%', 'DOBLE', 92, 82),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'DOBLE', 83, 82),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%atural%', 'DOBLE', 87, 78),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'DOBLE', 79, 78),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 111, 99),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 100, 99),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 106, 95),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 96, 95),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%in campo%', 'DOBLE', 71, 63),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'DOBLE', 64, 63),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%in campo%', 'DOBLE', 66, 59),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'DOBLE', 60, 59),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 92, 82),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 83, 82),
  ('Fútbol Salou 2027 · venta general', 'Mediterrània MED2/3', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 87, 78),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 79, 78),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%rtificial%', 'DOBLE', 73, 65),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'DOBLE', 66, 65),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%rtificial%', 'DOBLE', 67, 60),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'DOBLE', 61, 60),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 92, 82),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 83, 82),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 86, 77),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%rtificial%', 'INDIVIDUAL|1 PAX X HAB', 78, 77),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%atural%', 'DOBLE', 86, 77),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'DOBLE', 78, 77),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%atural%', 'DOBLE', 82, 73),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'DOBLE', 74, 73),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 105, 94),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 95, 94),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 101, 90),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%atural%', 'INDIVIDUAL|1 PAX X HAB', 91, 90),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%in campo%', 'DOBLE', 65, 58),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'DOBLE', 59, 58),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%in campo%', 'DOBLE', 60, 54),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'DOBLE', 55, 54),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 86, 77),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'PC', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 78, 77),
  ('Fútbol Salou 2027 · venta general', 'Villa Bonita / Aloha', 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 82, 73),
  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, 'MP', '%in campo%', 'INDIVIDUAL|1 PAX X HAB', 74, 73)
) AS v(documento, alojamiento, regimen, campo, ocupacion, venta, coste)
WHERE r."accommodationId" = a."id"
  AND a."sourceDocumentId" = d."id"
  AND d."controlName" = v.documento
  AND (v.alojamiento IS NULL OR a."accommodationName" = v.alojamiento)
  AND r."boardType" = v.regimen
  AND r."includedService" ILIKE v.campo
  AND r."occupancyLabel" ~* ('^(' || v.ocupacion || ')$')
  AND round(r."pvpAmount" * 100) = round(v.venta * 100)
  AND r."netSaleAmount" IS NULL;
