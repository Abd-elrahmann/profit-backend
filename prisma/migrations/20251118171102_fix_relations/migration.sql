-- AlterTable
ALTER TABLE "PartnerShareAccrual" ADD COLUMN     "periodId" INTEGER;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;
