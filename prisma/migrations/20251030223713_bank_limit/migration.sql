/*
  Warnings:

  - Added the required column `limit` to the `BANK_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('Active', 'Expired');

-- AlterTable
ALTER TABLE "BANK_accounts" ADD COLUMN     "limit" INTEGER NOT NULL,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'Active';
