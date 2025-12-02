/*
  Warnings:

  - You are about to drop the `RolePermissionSection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."RolePermissionSection" DROP CONSTRAINT "RolePermissionSection_rolePermissionId_fkey";

-- DropTable
DROP TABLE "public"."RolePermissionSection";
