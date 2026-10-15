-- Tanda 3 (reunión del 08/10/2026).

-- El departamento de un documento de tarifas: GROUPS, SPORTS o NULL (los dos).
ALTER TABLE "SourceDocument" ADD COLUMN "department" TEXT;

-- Los documentos de fútbol son de Turismo Deportivo sin discusión. El resto
-- («Hoteles Oravia 2027», las actividades) se queda para los dos hasta que
-- Oravia diga otra cosa desde la pantalla de Tarifas.
UPDATE "SourceDocument"
SET "department" = 'SPORTS'
WHERE "controlName" LIKE 'Fútbol Salou%' OR "controlName" = 'Tarifas Oravia Sports';

-- El periodo de una tarifa de actividad. La lectura ya lo traía y se perdía al
-- publicar: cada actividad tenía un solo precio para todo el año.
ALTER TABLE "ActivityRate" ADD COLUMN "seasonName" TEXT;
ALTER TABLE "ActivityRate" ADD COLUMN "dateFrom" TIMESTAMP(3);
ALTER TABLE "ActivityRate" ADD COLUMN "dateTo" TIMESTAMP(3);
