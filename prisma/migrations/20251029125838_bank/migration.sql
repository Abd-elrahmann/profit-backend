-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "bankAccountId" INTEGER,
ADD COLUMN     "partnerId" INTEGER;

-- CreateTable
CREATE TABLE "BANK_accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" INTEGER NOT NULL,

    CONSTRAINT "BANK_accounts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
