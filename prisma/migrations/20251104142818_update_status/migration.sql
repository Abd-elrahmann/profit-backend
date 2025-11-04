/*
  Warnings:

  - The values [ملتزم,متأخر] on the enum `ClientStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ClientStatus_new" AS ENUM ('نشط', 'منتهي', 'متعثر');
ALTER TABLE "public"."Client" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "status" TYPE "ClientStatus_new" USING ("status"::text::"ClientStatus_new");
ALTER TYPE "ClientStatus" RENAME TO "ClientStatus_old";
ALTER TYPE "ClientStatus_new" RENAME TO "ClientStatus";
DROP TYPE "public"."ClientStatus_old";
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'نشط';
COMMIT;

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'نشط';
