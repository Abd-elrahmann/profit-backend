/*
  Warnings:

  - Added the required column `monthlyAmount` to the `PartnerWithdrawal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PartnerWithdrawal" ADD COLUMN     "monthlyAmount" DOUBLE PRECISION NOT NULL;
