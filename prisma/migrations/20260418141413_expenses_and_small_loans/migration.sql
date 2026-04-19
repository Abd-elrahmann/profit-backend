-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "bankAccountId" INTEGER;

-- AlterTable
ALTER TABLE "SmallLoan" ADD COLUMN     "bankAccountId" INTEGER;

-- CreateIndex
CREATE INDEX "ExpenseRecord_bankAccountId_idx" ON "ExpenseRecord"("bankAccountId");

-- CreateIndex
CREATE INDEX "SmallLoan_bankAccountId_idx" ON "SmallLoan"("bankAccountId");

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmallLoan" ADD CONSTRAINT "SmallLoan_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
