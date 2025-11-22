-- CreateTable
CREATE TABLE "PartnerSavingAccrual" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accrualId" INTEGER NOT NULL,
    "savingAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSavingAccrual_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartnerSavingAccrual" ADD CONSTRAINT "PartnerSavingAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSavingAccrual" ADD CONSTRAINT "PartnerSavingAccrual_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "PartnerShareAccrual"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
