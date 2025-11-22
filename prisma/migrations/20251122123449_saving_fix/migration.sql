-- DropForeignKey
ALTER TABLE "public"."PartnerSavingAccrual" DROP CONSTRAINT "PartnerSavingAccrual_accrualId_fkey";

-- AddForeignKey
ALTER TABLE "PartnerSavingAccrual" ADD CONSTRAINT "PartnerSavingAccrual_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "PartnerPeriodProfit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
