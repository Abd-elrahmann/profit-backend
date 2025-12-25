/*
  Warnings:

  - A unique constraint covering the columns `[accountNewCapitalId]` on the table `Partner` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `accountNewCapitalId` to the `Partner` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "accountNewCapitalId" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountNewCapitalId_key" ON "Partner"("accountNewCapitalId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountNewCapitalId_fkey" FOREIGN KEY ("accountNewCapitalId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
