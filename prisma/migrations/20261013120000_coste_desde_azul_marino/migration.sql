-- El coste de las tarifas de venta estaba en «neto azul marino».
--
-- Al publicar, la app guardaba el coste que traía el documento en
-- `netAzulmarinoAmount` y dejaba `netSaleAmount` (el coste de verdad) vacío en
-- los documentos de venta. Así quedaron las 646 tarifas de «Hoteles Oravia
-- 2027»: Hotel Planas PC con venta 43,13 y el coste 40,50 en el campo de Azul
-- Marino. El CRM no podía calcular margen.
--
-- Se mueve solo lo que es inequívocamente ese caso: documento de venta, coste
-- vacío, y un importe en azul marino positivo y menor que la venta. Ninguna
-- tarifa de producción tiene hoy un precio de Azul Marino de verdad (la
-- columna del Excel está vacía en las 646 filas). Si no se cumple, no se toca.
UPDATE "AccommodationRate" r
SET "netSaleAmount" = r."netAzulmarinoAmount",
    "netAzulmarinoAmount" = NULL
FROM "SourceDocument" d
WHERE r."sourceDocumentId" = d."id"
  AND d."rateKind" = 'SALE'
  AND r."netSaleAmount" IS NULL
  AND r."netAzulmarinoAmount" IS NOT NULL
  AND r."netAzulmarinoAmount" > 0
  AND r."pvpAmount" IS NOT NULL
  AND r."netAzulmarinoAmount" < r."pvpAmount";
