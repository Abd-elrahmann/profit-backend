/*
  Warnings:

  - A unique constraint covering the columns `[interestAccountId]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AccountBasicType" ADD VALUE 'CLIENT_INTEREST';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "interestAccountId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Client_interestAccountId_key" ON "Client"("interestAccountId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_interestAccountId_fkey" FOREIGN KEY ("interestAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
