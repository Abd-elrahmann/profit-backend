/*
  Warnings:

  - Added the required column `zakatAccruals` to the `PartnerWithdrawalBackup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PartnerWithdrawalBackup" ADD COLUMN     "zakatAccruals" JSONB NOT NULL;
