/*
  Warnings:

  - You are about to drop the column `capital` on the `Partner` table. All the data in the column will be lost.
  - You are about to drop the column `sharePercent` on the `Partner` table. All the data in the column will be lost.
  - You are about to drop the `AccountBalance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AccountingPeriod` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LoanInvestor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PartnerTransaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProfitDistribution` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[accountPayableId]` on the table `Partner` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[accountEquityId]` on the table `Partner` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accountBasicType` to the `Account` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountEquityId` to the `Partner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountPayableId` to the `Partner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orgProfitPercent` to the `Partner` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccountBasicType" AS ENUM ('BANK', 'CASH', 'LOANS_RECEIVABLE', 'PARTNER_PAYABLE', 'PARTNER_EQUITY', 'LOAN_INCOME', 'COMPANY_SHARES', 'PARTNER_SHARES_EXPENSES', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEBIT', 'CREDIT');

-- DropForeignKey
ALTER TABLE "public"."AccountBalance" DROP CONSTRAINT "AccountBalance_accountId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AccountBalance" DROP CONSTRAINT "AccountBalance_periodId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AccountingPeriod" DROP CONSTRAINT "AccountingPeriod_closingJournalId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AccountingPeriod" DROP CONSTRAINT "AccountingPeriod_openingJournalId_fkey";

-- DropForeignKey
ALTER TABLE "public"."JournalHeader" DROP CONSTRAINT "JournalHeader_periodId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoanInvestor" DROP CONSTRAINT "LoanInvestor_loanId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoanInvestor" DROP CONSTRAINT "LoanInvestor_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PartnerTransaction" DROP CONSTRAINT "PartnerTransaction_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ProfitDistribution" DROP CONSTRAINT "ProfitDistribution_partnerId_fkey";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accountBasicType" "AccountBasicType" NOT NULL,
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nature" "AccountNature" NOT NULL DEFAULT 'DEBIT';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "debit" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "clientId" INTEGER;

-- AlterTable
ALTER TABLE "Partner" DROP COLUMN "capital",
DROP COLUMN "sharePercent",
ADD COLUMN     "accountEquityId" INTEGER NOT NULL,
ADD COLUMN     "accountPayableId" INTEGER NOT NULL,
ADD COLUMN     "orgProfitPercent" DOUBLE PRECISION NOT NULL;

-- DropTable
DROP TABLE "public"."AccountBalance";

-- DropTable
DROP TABLE "public"."AccountingPeriod";

-- DropTable
DROP TABLE "public"."LoanInvestor";

-- DropTable
DROP TABLE "public"."PartnerTransaction";

-- DropTable
DROP TABLE "public"."ProfitDistribution";

-- CreateTable
CREATE TABLE "PeriodHeader" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingJournalId" INTEGER,
    "closingJournalId" INTEGER,

    CONSTRAINT "PeriodHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountsClosing" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountsClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientsClosing" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientsClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeriodHeader_openingJournalId_key" ON "PeriodHeader"("openingJournalId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodHeader_closingJournalId_key" ON "PeriodHeader"("closingJournalId");

-- CreateIndex
CREATE INDEX "Account_accountBasicType_code_idx" ON "Account"("accountBasicType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountPayableId_key" ON "Partner"("accountPayableId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountEquityId_key" ON "Partner"("accountEquityId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountEquityId_fkey" FOREIGN KEY ("accountEquityId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountsClosing" ADD CONSTRAINT "accountsClosing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountsClosing" ADD CONSTRAINT "accountsClosing_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsClosing" ADD CONSTRAINT "clientsClosing_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsClosing" ADD CONSTRAINT "clientsClosing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
