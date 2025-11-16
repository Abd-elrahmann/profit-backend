/*
  Warnings:

  - You are about to drop the column `share` on the `LoanPartnerShare` table. All the data in the column will be lost.
  - Added the required column `sharePercent` to the `LoanPartnerShare` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LoanPartnerShare" DROP COLUMN "share",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sharePercent" DOUBLE PRECISION NOT NULL;
