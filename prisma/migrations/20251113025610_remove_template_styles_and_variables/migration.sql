/*
  Warnings:

  - You are about to drop the column `styles` on the `Template` table. All the data in the column will be lost.
  - You are about to drop the column `variables` on the `Template` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Template" DROP COLUMN "styles",
DROP COLUMN "variables";
