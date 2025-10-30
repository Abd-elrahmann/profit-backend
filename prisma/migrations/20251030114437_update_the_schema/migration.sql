/*
  Warnings:

  - The `sourceType` column on the `JournalHeader` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `type` on the `Notification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOAN_REMINDER', 'REPAYMENT_DUE', 'REPAYMENT_LATE', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'GENERAL');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('LOAN', 'REPAYMENT', 'PARTNER', 'PERIOD_CLOSING', 'OTHER');

-- AlterTable
ALTER TABLE "JournalHeader" DROP COLUMN "sourceType",
ADD COLUMN     "sourceType" "JournalSourceType";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL;
