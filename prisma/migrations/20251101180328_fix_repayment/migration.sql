/*
  Warnings:

  - Added the required column `remaining` to the `Repayment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN     "remaining" DOUBLE PRECISION NOT NULL;
