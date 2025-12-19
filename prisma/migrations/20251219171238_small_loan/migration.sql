-- CreateEnum
CREATE TYPE "SmallLoanStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');

-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'SMALL_LOAN';

-- CreateTable
CREATE TABLE "SmallLoan" (
    "id" SERIAL NOT NULL,
    "Name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL,
    "status" "SmallLoanStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SmallLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmallLoan_status_idx" ON "SmallLoan"("status");
