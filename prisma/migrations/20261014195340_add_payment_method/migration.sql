-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');

-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "paymentMethod" "PaymentMethod";
