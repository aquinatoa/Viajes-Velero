-- Los adjuntos de la conversación con el colegio (Javier, 08/10/2026).
CREATE TABLE "CorreoAdjunto" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "ruta" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorreoAdjunto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CorreoAdjunto_mensajeId_idx" ON "CorreoAdjunto"("mensajeId");

ALTER TABLE "CorreoAdjunto" ADD CONSTRAINT "CorreoAdjunto_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "CorreoMensaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;
