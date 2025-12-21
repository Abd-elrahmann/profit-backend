/*
  Warnings:

  - You are about to drop the `TemplateStyle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TemplateVariable` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'LOAN_CONVERSION';

-- DropForeignKey
ALTER TABLE "public"."TemplateStyle" DROP CONSTRAINT "TemplateStyle_templateId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TemplateVariable" DROP CONSTRAINT "TemplateVariable_templateId_fkey";

-- DropTable
DROP TABLE "public"."TemplateStyle";

-- DropTable
DROP TABLE "public"."TemplateVariable";
