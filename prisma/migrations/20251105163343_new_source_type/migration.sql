/*
  Warnings:

  - The values [PARTNER_TRANSACTION] on the enum `JournalSourceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "JournalSourceType_new" AS ENUM ('LOAN', 'REPAYMENT', 'PARTNER', 'PARTNER_TRANSACTION_WITHDRAWAL', 'PARTNER_TRANSACTION_DEPOSIT', 'PERIOD_CLOSING', 'OTHER');
ALTER TABLE "JournalHeader" ALTER COLUMN "sourceType" TYPE "JournalSourceType_new" USING ("sourceType"::text::"JournalSourceType_new");
ALTER TYPE "JournalSourceType" RENAME TO "JournalSourceType_old";
ALTER TYPE "JournalSourceType_new" RENAME TO "JournalSourceType";
DROP TYPE "public"."JournalSourceType_old";
COMMIT;
