-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('MUDARABAH', 'PROMISSORY_NOTE', 'DEBT_ACKNOWLEDGMENT', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "mudarabahFileUrl" TEXT;

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "name" "TemplateType" NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");
