/*
  Warnings:

  - Added the required column `source` to the `Loan` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LoanFundSource" AS ENUM ('GENERAL', 'NEW_CAPITAL');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "source" "LoanFundSource" NOT NULL;
