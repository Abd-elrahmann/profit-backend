/*
  Warnings:

  - Added the required column `code` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interestAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "interestAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalAmount" DOUBLE PRECISION NOT NULL;
