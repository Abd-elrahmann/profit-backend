-- AlterTable
ALTER TABLE "PartnerWithdrawal" ADD COLUMN     "bankAccountId" INTEGER;

-- CreateIndex
CREATE INDEX "PartnerWithdrawal_bankAccountId_idx" ON "PartnerWithdrawal"("bankAccountId");

-- AddForeignKey
ALTER TABLE "PartnerWithdrawal" ADD CONSTRAINT "PartnerWithdrawal_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
