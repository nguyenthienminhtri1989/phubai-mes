-- AlterTable
ALTER TABLE "PowerTransformer" ADD COLUMN     "factoryId" TEXT;

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Factory_code_key" ON "Factory"("code");

-- CreateIndex
CREATE INDEX "Factory_isActive_idx" ON "Factory"("isActive");

-- CreateIndex
CREATE INDEX "PowerTransformer_factoryId_idx" ON "PowerTransformer"("factoryId");

-- AddForeignKey
ALTER TABLE "PowerTransformer" ADD CONSTRAINT "PowerTransformer_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
