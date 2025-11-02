/*
  Warnings:

  - The `attachments` column on the `Repayment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Repayment" DROP COLUMN "attachments",
ADD COLUMN     "attachments" TEXT[];
