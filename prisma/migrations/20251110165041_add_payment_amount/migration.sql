/*
  Warnings:

  - You are about to alter the column `amount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `interestRate` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `interestAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `totalAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `earlyPaidAmount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `earlyPaymentDiscount` on the `Loan` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `amount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `paidAmount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `remaining` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - You are about to alter the column `principalAmount` on the `Repayment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(65,30)`.
  - Added the required column `paymentAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "paymentAmount" DECIMAL(65,30) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "interestRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "interestAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "earlyPaidAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "earlyPaymentDiscount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Repayment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "remaining" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "principalAmount" SET DATA TYPE DECIMAL(65,30);
