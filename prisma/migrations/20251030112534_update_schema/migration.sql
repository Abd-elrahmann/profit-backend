-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "BANK_accounts" ALTER COLUMN "accountNumber" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "disbursementJournalId" INTEGER,
ADD COLUMN     "settlementJournalId" INTEGER;

-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reviewStatus" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "clientId" INTEGER,
    "loanId" INTEGER,
    "repaymentId" INTEGER,
    "channel" TEXT,
    "sentAt" TIMESTAMP(3),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
