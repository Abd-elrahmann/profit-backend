/*
  Warnings:

  - You are about to drop the column `amount` on the `PartnerShareAccrual` table. All the data in the column will be lost.
  - Added the required column `companyCut` to the `PartnerShareAccrual` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partnerFinal` to the `PartnerShareAccrual` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rawShare` to the `PartnerShareAccrual` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PartnerShareAccrual" DROP COLUMN "amount",
ADD COLUMN     "companyCut" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "isClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerFinal" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "rawShare" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "LoanPartnerShare" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "share" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LoanPartnerShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPeriodProfit" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PartnerPeriodProfit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoanPartnerShare" ADD CONSTRAINT "LoanPartnerShare_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPartnerShare" ADD CONSTRAINT "LoanPartnerShare_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPeriodProfit" ADD CONSTRAINT "PartnerPeriodProfit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPeriodProfit" ADD CONSTRAINT "PartnerPeriodProfit_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
