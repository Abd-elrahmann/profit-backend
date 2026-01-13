-- AlterTable
ALTER TABLE "LoanNewCapitalShare" ADD COLUMN     "orgProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LoanPartnerShare" ADD COLUMN     "orgProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
