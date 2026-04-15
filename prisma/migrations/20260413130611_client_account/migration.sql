/*
  Warnings:

  - A unique constraint covering the columns `[accountId]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AccountBasicType" ADD VALUE 'CLIENT';

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "accountId" INTEGER;

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_screen_idx" ON "AuditLog"("screen");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_accountId_key" ON "Client"("accountId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_userId_idx" ON "ExpenseRecord"("userId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_journalId_idx" ON "ExpenseRecord"("journalId");

-- CreateIndex
CREATE INDEX "ExpenseRecord_createdAt_idx" ON "ExpenseRecord"("createdAt");

-- CreateIndex
CREATE INDEX "JournalHeader_status_idx" ON "JournalHeader"("status");

-- CreateIndex
CREATE INDEX "JournalHeader_sourceType_idx" ON "JournalHeader"("sourceType");

-- CreateIndex
CREATE INDEX "JournalHeader_sourceId_idx" ON "JournalHeader"("sourceId");

-- CreateIndex
CREATE INDEX "JournalHeader_date_idx" ON "JournalHeader"("date");

-- CreateIndex
CREATE INDEX "JournalHeader_periodId_idx" ON "JournalHeader"("periodId");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_clientId_idx" ON "JournalLine"("clientId");

-- CreateIndex
CREATE INDEX "PartnerShareAccrual_loanId_idx" ON "PartnerShareAccrual"("loanId");

-- CreateIndex
CREATE INDEX "PartnerShareAccrual_partnerId_idx" ON "PartnerShareAccrual"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerShareAccrual_isClosed_idx" ON "PartnerShareAccrual"("isClosed");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
