-- Los clientes especiales pasan del código a la base de datos. Los dos que
-- había conservan su código: es lo que llevan guardado sus tarifas.
CREATE TABLE "ClienteEspecial" (
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "detalle" TEXT,
    "porcentajeSobrePvp" DECIMAL(65,30),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteEspecial_pkey" PRIMARY KEY ("codigo")
);

INSERT INTO "ClienteEspecial" ("codigo", "nombre", "detalle") VALUES
    ('SWISS_TTOO', 'Turoperador suizo', 'Destination · Travelclub'),
    ('AZUL_MARINO', 'Azul Marino', 'precio propio pactado');
