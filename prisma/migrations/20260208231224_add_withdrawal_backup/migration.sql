-- CreateTable
CREATE TABLE "PartnerWithdrawalBackup" (
    "id" SERIAL NOT NULL,
    "withdrawalId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "loanShares" JSONB NOT NULL,
    "newCapitalShares" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWithdrawalBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerWithdrawalBackup_withdrawalId_key" ON "PartnerWithdrawalBackup"("withdrawalId");

-- AddForeignKey
ALTER TABLE "PartnerWithdrawalBackup" ADD CONSTRAINT "PartnerWithdrawalBackup_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "PartnerWithdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
