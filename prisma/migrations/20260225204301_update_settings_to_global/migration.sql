/*
  Warnings:

  - You are about to drop the column `userId` on the `Settings` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Settings" DROP CONSTRAINT "Settings_userId_fkey";

-- DropIndex
DROP INDEX "public"."Settings_userId_key";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "userId";
