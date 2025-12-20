/*
  Warnings:

  - The `repaymentDay` column on the `Loan` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Loan" DROP COLUMN "repaymentDay",
ADD COLUMN     "repaymentDay" TIMESTAMP(3);
