-- AlterTable
ALTER TABLE "ExpenseRecord" ADD COLUMN     "openingJournalLineId" INTEGER;

-- CreateIndex
CREATE INDEX "ExpenseRecord_openingJournalLineId_idx" ON "ExpenseRecord"("openingJournalLineId");

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_openingJournalLineId_fkey" FOREIGN KEY ("openingJournalLineId") REFERENCES "JournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
