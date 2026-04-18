/*
  Warnings:

  - A unique constraint covering the columns `[accountId]` on the table `BANK_accounts` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "BANK_accounts" ADD COLUMN     "accountId" INTEGER;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "bankAccountId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "BANK_accounts_accountId_key" ON "BANK_accounts"("accountId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BANK_accounts" ADD CONSTRAINT "BANK_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
