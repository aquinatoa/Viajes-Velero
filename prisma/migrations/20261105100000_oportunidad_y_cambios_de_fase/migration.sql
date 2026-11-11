-- Solo aditiva: dos tablas nuevas, nada de lo existente se toca.

-- El registro propio de la app para una oportunidad (trato de Zoho).
CREATE TABLE "Oportunidad" (
    "id" TEXT NOT NULL,
    "crmDealId" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "adoptadaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adoptadaPor" TEXT,
    "chosenOptionNumber" INTEGER,
    "chosenAt" TIMESTAMP(3),
    "depositDueAt" TIMESTAMP(3),
    "depositPaidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Oportunidad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Oportunidad_crmDealId_key" ON "Oportunidad"("crmDealId");

-- Constancia de cada cambio de fase.
CREATE TABLE "CambioDeFase" (
    "id" TEXT NOT NULL,
    "crmDealId" TEXT NOT NULL,
    "desde" TEXT,
    "hasta" TEXT NOT NULL,
    "motivo" TEXT,
    "origen" TEXT NOT NULL,
    "hito" TEXT,
    "porUserId" TEXT,
    "porNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CambioDeFase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CambioDeFase_crmDealId_createdAt_idx" ON "CambioDeFase"("crmDealId", "createdAt");
