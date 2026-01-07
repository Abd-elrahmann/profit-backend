/*
  Warnings:

  - A unique constraint covering the columns `[partnerId,loanId]` on the table `PartnerShareAccrual` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "discount" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "PartnerShareAccrual_partnerId_loanId_key" ON "PartnerShareAccrual"("partnerId", "loanId");
