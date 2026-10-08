-- Una actividad de la propuesta ya no es una tarifa por persona: es una lista
-- de líneas (tarifa × cantidad). Se guardan como JSON junto al total del
-- grupo; `pvpSnapshot` sigue siendo lo que se suma por alumno.
ALTER TABLE "ProposalActivityOption" ADD COLUMN     "linesJson" TEXT;
ALTER TABLE "ProposalActivityOption" ADD COLUMN     "amountTotal" DECIMAL(65,30);
