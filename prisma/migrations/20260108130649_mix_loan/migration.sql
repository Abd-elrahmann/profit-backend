-- AlterEnum
ALTER TYPE "LoanFundSource" ADD VALUE 'MIX';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "generalAmount" DOUBLE PRECISION,
ADD COLUMN     "generalInterestAmount" DOUBLE PRECISION,
ADD COLUMN     "newCapitalAmount" DOUBLE PRECISION,
ADD COLUMN     "newCapitalInterestAmount" DOUBLE PRECISION;
