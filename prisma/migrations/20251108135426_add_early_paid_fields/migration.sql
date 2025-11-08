-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'EARLY_PAID';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "earlyPaidAmount" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "earlyPaymentDiscount" DOUBLE PRECISION DEFAULT 0;
