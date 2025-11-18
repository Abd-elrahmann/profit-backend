-- AlterTable
ALTER TABLE "PartnerShareAccrual" ADD COLUMN     "isDistributed" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "JournalHeader" ADD CONSTRAINT "JournalHeader_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
