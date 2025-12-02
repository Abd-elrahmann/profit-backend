-- CreateTable
CREATE TABLE "RolePermissionSection" (
    "id" SERIAL NOT NULL,
    "rolePermissionId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissionSection_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RolePermissionSection" ADD CONSTRAINT "RolePermissionSection_rolePermissionId_fkey" FOREIGN KEY ("rolePermissionId") REFERENCES "RolePermission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
