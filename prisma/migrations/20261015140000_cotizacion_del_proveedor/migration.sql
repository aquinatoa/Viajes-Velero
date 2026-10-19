-- La cotización del proveedor para lo que no está en el catálogo, y el coste
-- de la tarifa elegida guardado en la propuesta.
CREATE TABLE "CotizacionProveedor" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT,
    "tipoFichero" TEXT,
    "tamano" INTEGER,
    "ruta" TEXT,
    "textoPegado" TEXT,
    "lecturaJson" TEXT,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotizacionProveedor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProposalAccommodationOption" ADD COLUMN "studentCostAmount" DECIMAL(65,30);
ALTER TABLE "ProposalAccommodationOption" ADD COLUMN "teacherCostAmount" DECIMAL(65,30);
ALTER TABLE "ProposalAccommodationOption" ADD COLUMN "supplierQuoteId" TEXT;

ALTER TABLE "ProposalActivityOption" ADD COLUMN "unitCostAmount" DECIMAL(65,30);
ALTER TABLE "ProposalActivityOption" ADD COLUMN "supplierQuoteId" TEXT;
