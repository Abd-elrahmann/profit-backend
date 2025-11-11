/*
  Warnings:

  - You are about to alter the column `amount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `interestRate` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `interestAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `totalAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `earlyPaidAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `earlyPaymentDiscount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `paymentAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `amount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `paidAmount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `remaining` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to alter the column `principalAmount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.

*/
-- AlterTable
ALTER TABLE "Loan" ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "interestRate" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "interestAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "totalAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "earlyPaidAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "earlyPaymentDiscount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "paymentAmount" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Repayment" ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "paidAmount" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "remaining" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "principalAmount" SET DATA TYPE DOUBLE PRECISION;
