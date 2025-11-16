-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PartnerShareAccrual" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "loanId" INTEGER,
    "repaymentId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerShareAccrual_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
