/*
  Warnings:

  - The values [ACTIVE,INACTIVE,DELINQUENT,CLOSED] on the enum `ClientStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `documents` on the `Client` table. All the data in the column will be lost.
  - Added the required column `birthDate` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `city` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `creationReason` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `district` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `employer` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `obligations` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `salary` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Made the column `nationalId` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `phone` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `address` on table `Client` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ClientStatus_new" AS ENUM ('ملتزم', 'متأخر', 'متعثر');
ALTER TABLE "public"."Client" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Client" ALTER COLUMN "status" TYPE "ClientStatus_new" USING ("status"::text::"ClientStatus_new");
ALTER TYPE "ClientStatus" RENAME TO "ClientStatus_old";
ALTER TYPE "ClientStatus_new" RENAME TO "ClientStatus";
DROP TYPE "public"."ClientStatus_old";
ALTER TABLE "Client" ALTER COLUMN "status" SET DEFAULT 'ملتزم';
COMMIT;

-- AlterTable
ALTER TABLE "Client" DROP COLUMN "documents",
ADD COLUMN     "birthDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "creationReason" TEXT NOT NULL,
ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "employer" TEXT NOT NULL,
ADD COLUMN     "kafeelId" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "obligations" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "salary" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "nationalId" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "address" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ملتزم';

-- CreateTable
CREATE TABLE "Kafeel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL,
    "obligations" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kafeel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "clientIdImage" TEXT NOT NULL,
    "clientWorkCard" TEXT,
    "salaryReport" TEXT,
    "simaReport" TEXT,
    "kafeelIdImage" TEXT,
    "kafeelWorkCard" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_kafeelId_fkey" FOREIGN KEY ("kafeelId") REFERENCES "Kafeel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
