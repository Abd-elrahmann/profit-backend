/*
  Warnings:

  - Added the required column `owner` to the `BANK_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BANK_accounts" ADD COLUMN     "owner" TEXT NOT NULL;
