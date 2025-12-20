/*
  Warnings:

  - A unique constraint covering the columns `[expenseAccountId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expenseAccountId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_expenseAccountId_key" ON "User"("expenseAccountId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
