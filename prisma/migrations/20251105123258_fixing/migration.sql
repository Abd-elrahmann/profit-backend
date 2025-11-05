/*
  Warnings:

  - You are about to drop the column `DEBT_ACKNOWLEDGMENT` on the `ClientDocument` table. All the data in the column will be lost.
  - You are about to drop the column `PROMISSORY_NOTE` on the `ClientDocument` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ClientDocument" DROP COLUMN "DEBT_ACKNOWLEDGMENT",
DROP COLUMN "PROMISSORY_NOTE";
