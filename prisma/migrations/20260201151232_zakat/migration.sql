/*
  Warnings:

  - Added the required column `zakatWithdrawId` to the `ZakatPayment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ZakatPayment" ADD COLUMN     "zakatWithdrawId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "ZakatPayment" ADD CONSTRAINT "ZakatPayment_zakatWithdrawId_fkey" FOREIGN KEY ("zakatWithdrawId") REFERENCES "zakatWithdraw"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
