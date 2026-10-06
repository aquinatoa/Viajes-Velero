-- CreateTable
CREATE TABLE "AiLectura" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "variante" TEXT,
    "resultado" TEXT NOT NULL,
    "error" TEXT,
    "llamadas" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "outputChars" INTEGER NOT NULL DEFAULT 0,
    "iniciadaEn" TIMESTAMP(3) NOT NULL,
    "terminadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiLectura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiLectura_sourceDocumentId_idx" ON "AiLectura"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "AiLectura_terminadaEn_idx" ON "AiLectura"("terminadaEn");

-- AddForeignKey
ALTER TABLE "AiLectura" ADD CONSTRAINT "AiLectura_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
