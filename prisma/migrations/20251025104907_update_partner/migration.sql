/*
  Warnings:

  - Added the required column `address` to the `Partner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `capitalAmount` to the `Partner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nationalId` to the `Partner` table without a default value. This is not possible if the table is not empty.
  - Added the required column `partnerProfitPercent` to the `Partner` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "capitalAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "contractSignedAt" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "nationalId" TEXT NOT NULL,
ADD COLUMN     "partnerProfitPercent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "phone" TEXT;
