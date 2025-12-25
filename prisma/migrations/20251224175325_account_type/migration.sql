-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountBasicType" ADD VALUE 'PARTNER_NEW_CAPITAL';
ALTER TYPE "AccountBasicType" ADD VALUE 'NEW_CAPITAL_BANK';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "isNewPartner" BOOLEAN NOT NULL DEFAULT true;
