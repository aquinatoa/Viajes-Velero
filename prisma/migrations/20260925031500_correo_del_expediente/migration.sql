-- AlterTable
ALTER TABLE "ProposalDelivery" ADD COLUMN     "messageId" TEXT;

-- CreateTable
CREATE TABLE "CorreoMensaje" (
    "id" TEXT NOT NULL,
    "buzon" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "uid" INTEGER,
    "uidValidity" INTEGER,
    "carpeta" TEXT,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "referencias" TEXT,
    "de" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "deliveryId" TEXT,
    "emparejadoPor" TEXT,
    "visto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorreoMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorreoMensaje_messageId_key" ON "CorreoMensaje"("messageId");

-- CreateIndex
CREATE INDEX "CorreoMensaje_deliveryId_idx" ON "CorreoMensaje"("deliveryId");

-- CreateIndex
CREATE INDEX "CorreoMensaje_buzon_direccion_idx" ON "CorreoMensaje"("buzon", "direccion");

-- CreateIndex
CREATE INDEX "CorreoMensaje_fecha_idx" ON "CorreoMensaje"("fecha");

-- CreateIndex
CREATE INDEX "CorreoMensaje_emparejadoPor_idx" ON "CorreoMensaje"("emparejadoPor");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalDelivery_messageId_key" ON "ProposalDelivery"("messageId");

-- AddForeignKey
ALTER TABLE "CorreoMensaje" ADD CONSTRAINT "CorreoMensaje_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "ProposalDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

