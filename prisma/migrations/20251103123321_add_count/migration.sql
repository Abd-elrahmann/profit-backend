/*
  Warnings:

  - Added the required column `count` to the `Repayment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "count" INTEGER NOT NULL;
