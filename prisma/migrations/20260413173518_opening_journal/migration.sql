-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "isOpeningJournalId" INTEGER;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_isOpeningJournalId_fkey" FOREIGN KEY ("isOpeningJournalId") REFERENCES "JournalHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
