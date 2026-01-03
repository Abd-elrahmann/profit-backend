/*
  Warnings:

  - A unique constraint covering the columns `[loanId,partnerId]` on the table `LoanNewCapitalShare` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LoanNewCapitalShare_loanId_partnerId_key" ON "LoanNewCapitalShare"("loanId", "partnerId");
