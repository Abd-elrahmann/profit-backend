-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "newDueDate" TIMESTAMP(3),
ADD COLUMN     "postponeApproved" BOOLEAN,
ADD COLUMN     "postponeReason" TEXT;
