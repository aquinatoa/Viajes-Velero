-- 25/11/2026 · Costes que faltaban en «Servicios Contratados» (Javier, 24/11/2026).
-- Solo datos, y solo donde no hay nada: no pisa un coste ni un proveedor ya puestos.

-- 1. PortAventura: «nos da un 20% de comisión. La APP debería calcularlo
--    directamente con este dato». Coste = PVP menos el 20 %.
UPDATE "ActivityRate" r
SET "commissionPercent" = 20,
    "costNetAmount" = ROUND(r."salePvpAmount" * 0.8, 2)
FROM "Activity" a
WHERE a."id" = r."activityId"
  AND a."supplierName" = 'PortAventura World'
  AND r."salePvpAmount" IS NOT NULL
  AND r."costNetAmount" IS NULL;

-- 2. Extras de fútbol: «son de MARSOPA (mismo proveedor que los campos)».
UPDATE "Activity" a
SET "supplierName" = 'MARSOPA'
FROM "SourceDocument" d
WHERE d."id" = a."sourceDocumentId"
  AND d."controlName" = 'Fútbol Salou 2027 · venta general'
  AND a."supplierName" IS NULL;

-- 3. Sus costes, del PDF que mandó («tarifas ES_MSH_27 con bus», servicios
--    extra 2027). Los partidos amistosos, con el caso 1 (mismo turoperador):
--    40 € por equipo de lunes a jueves y 70 € en fin de semana, 2 equipos.
--    Césped, fútbol playa, luz, Miniestadi y arbitraje no salen en el PDF.
UPDATE "ActivityRate" r
SET "costNetAmount" = c.coste
FROM "Activity" a
JOIN "SourceDocument" d ON d."id" = a."sourceDocumentId"
JOIN (VALUES
  ('Balones perdidos', 40.00),
  ('Entrenador asistente (a partir de 21-30 jugadores)', 150.00),
  ('Master class y/o Técnicos especialistas (1-20 pax)', 230.00),
  ('Material (1 a 7 días): conos, conos de disco, balones', 80.00),
  ('Partido amistoso: de lunes a jueves', 80.00),
  ('Partido amistoso: de viernes a domingo', 140.00)
) AS c(nombre, coste) ON c.nombre = a."activityName"
WHERE a."id" = r."activityId"
  AND d."controlName" = 'Fútbol Salou 2027 · venta general'
  AND r."costNetAmount" IS NULL;
