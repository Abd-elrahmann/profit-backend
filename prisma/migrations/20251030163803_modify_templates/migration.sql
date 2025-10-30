/*
  Warnings:

  - You are about to drop the column `read` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TemplateType" ADD VALUE 'REPAYMENT_DUE';
ALTER TYPE "TemplateType" ADD VALUE 'REPAYMENT_LATE';
ALTER TYPE "TemplateType" ADD VALUE 'PAYMENT_APPROVED';
ALTER TYPE "TemplateType" ADD VALUE 'PAYMENT_REJECTED';
ALTER TYPE "TemplateType" ADD VALUE 'GENERAL_NOTIFICATION';

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "read";
