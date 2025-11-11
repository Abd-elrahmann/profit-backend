/*
  Warnings:

  - You are about to drop the column `kafeelId` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `kafeelIdImage` on the `ClientDocument` table. All the data in the column will be lost.
  - You are about to drop the column `kafeelWorkCard` on the `ClientDocument` table. All the data in the column will be lost.
  - Added the required column `clientId` to the `Kafeel` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Client" DROP CONSTRAINT "Client_kafeelId_fkey";

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "kafeelId";

-- AlterTable
ALTER TABLE "ClientDocument" DROP COLUMN "kafeelIdImage",
DROP COLUMN "kafeelWorkCard";

-- AlterTable
ALTER TABLE "Kafeel" ADD COLUMN     "clientId" INTEGER NOT NULL,
ADD COLUMN     "kafeelIdImage" TEXT,
ADD COLUMN     "kafeelWorkCard" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "kafeelId" INTEGER;

-- AddForeignKey
ALTER TABLE "Kafeel" ADD CONSTRAINT "Kafeel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_kafeelId_fkey" FOREIGN KEY ("kafeelId") REFERENCES "Kafeel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
