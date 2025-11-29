/*
  Warnings:

  - A unique constraint covering the columns `[accountSavingId]` on the table `Partner` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AccountBasicType" ADD VALUE 'PARTNER_SAVING';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "accountSavingId" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountSavingId_key" ON "Partner"("accountSavingId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountSavingId_fkey" FOREIGN KEY ("accountSavingId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
