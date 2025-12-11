-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'WITHDRAWING', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "WithdrawingStatus" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "isFrozen" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PartnerWithdrawalSchedule" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PartnerWithdrawalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWithdrawal" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "totalCapital" DOUBLE PRECISION NOT NULL,
    "defaultShare" DOUBLE PRECISION NOT NULL,
    "remainingCapital" DOUBLE PRECISION NOT NULL,
    "savingAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWithdrawal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartnerWithdrawalSchedule" ADD CONSTRAINT "PartnerWithdrawalSchedule_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWithdrawal" ADD CONSTRAINT "PartnerWithdrawal_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
