/*
  Warnings:

  - Added the required column `clientId` to the `Repayment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "PaymentProof" TEXT,
ADD COLUMN     "clientId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
