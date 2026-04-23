-- CreateEnum
CREATE TYPE "ExternalInvestmentStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountBasicType" ADD VALUE 'EXTERNAL_INVESTMENT';
ALTER TYPE "AccountBasicType" ADD VALUE 'EXTERNAL_PROFIT';

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'EXTERNAL_PROFIT';

-- CreateTable
CREATE TABLE "ExternalInvestment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "returnedAmount" DOUBLE PRECISION,
    "profit" DOUBLE PRECISION,
    "status" "ExternalInvestmentStatus" NOT NULL DEFAULT 'OPEN',
    "bankAccountId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalInvestment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExternalInvestment" ADD CONSTRAINT "ExternalInvestment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalInvestment" ADD CONSTRAINT "ExternalInvestment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
