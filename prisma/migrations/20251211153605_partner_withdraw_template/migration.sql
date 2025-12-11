/*
  Warnings:

  - The values [RECEIPT_VOUCHER] on the enum `TemplateType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TemplateType_new" AS ENUM ('MUDARABAH', 'PROMISSORY_NOTE', 'DEBT_ACKNOWLEDGMENT', 'WITHDRAWAL_RECEIPT', 'PAYMENT_VOUCHER', 'SETTLEMENT', 'PAYMENT_PROOF', 'REPAYMENT_DUE', 'REPAYMENT_LATE', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'GENERAL_NOTIFICATION');
ALTER TABLE "Template" ALTER COLUMN "name" TYPE "TemplateType_new" USING ("name"::text::"TemplateType_new");
ALTER TYPE "TemplateType" RENAME TO "TemplateType_old";
ALTER TYPE "TemplateType_new" RENAME TO "TemplateType";
DROP TYPE "public"."TemplateType_old";
COMMIT;
