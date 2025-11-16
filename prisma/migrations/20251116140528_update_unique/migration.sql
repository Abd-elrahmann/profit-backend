/*
  Warnings:

  - A unique constraint covering the columns `[loanId,partnerId]` on the table `LoanPartnerShare` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LoanPartnerShare_loanId_partnerId_key" ON "LoanPartnerShare"("loanId", "partnerId");
