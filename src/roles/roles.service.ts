import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class RolesService {
    constructor(private prisma: PrismaService) { }

    // ✅ Create a new role with permissions
    async createRole(currentUser, data: {
        name: string;
        description?: string;
        permissions: {
            module: string;
            canView?: boolean;
            canAdd?: boolean;
            canUpdate?: boolean;
            canDelete?: boolean;
            canPost?: boolean;
        }[];
    }) {
        const exists = await this.prisma.role.findUnique({ where: { name: data.name } });
        if (exists) throw new BadRequestException('Role name already exists');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const role = await this.prisma.role.create({
            data: {
                name: data.name,
                description: data.description,
                permissions: {
                    create: data.permissions.map((p) => ({
                        module: p.module,
                        canView: p.canView ?? false,
                        canAdd: p.canAdd ?? false,
                        canUpdate: p.canUpdate ?? false,
                        canDelete: p.canDelete ?? false,
                        canPost: p.canPost ?? false,
                    })),
                },
            },
            include: { permissions: true },
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أنشأ الدور ${role.name}`,
            },
        });

        return { message: 'Role created successfully', role };
    }

    // ✅ Get all roles (with optional filters by name or id)
    async getRoles(filters?: { id?: number; name?: string }) {
        const where: any = {};
        if (filters?.id) where.id = filters.id;
        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };

        const unformattedRoles = await this.prisma.role.findMany({
            where,
            include: { permissions: true },
            orderBy: { id: 'asc' },
        });

        const roles = unformattedRoles.map((role) => ({
            ...role,
            createdAt: role.createdAt
                ? DateTime.fromJSDate(role.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            updatedAt: role.updatedAt
                ? DateTime.fromJSDate(role.updatedAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
        }));

        return { total: roles.length, roles };
    }

    // ✅ Get permissions for a specific user
    async getUserPermissions(userId: number) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: { permissions: true },
                },
            },
        });

        if (!user) throw new NotFoundException('User not found');
        if (!user.role) return { permissions: [] };

        return {
            role: { id: user.role.id, name: user.role.name },
            permissions: user.role.permissions.map((p) => ({
                module: p.module,
                canView: p.canView,
                canAdd: p.canAdd,
                canUpdate: p.canUpdate,
                canDelete: p.canDelete,
                canPost: p.canPost,
            })),
        };
    }

    // ✅ Update role (and its permissions)
    async updateRole(
        id: number,
        currentUser,
        data: {
            name?: string;
            description?: string;
            permissions?: {
                module: string;
                canView?: boolean;
                canAdd?: boolean;
                canUpdate?: boolean;
                canDelete?: boolean;
                canPost?: boolean;
            }[];
        },
    ) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role) throw new NotFoundException('Role not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const updatedRole = await this.prisma.$transaction(async (tx) => {
            // Update role info
            const updated = await tx.role.update({
                where: { id },
                data: { name: data.name ?? role.name, description: data.description ?? role.description },
            });

            // If permissions provided → replace all
            if (data.permissions) {
                await tx.rolePermission.deleteMany({ where: { roleId: id } });

                await tx.rolePermission.createMany({
                    data: data.permissions.map((p) => ({
                        roleId: id,
                        module: p.module,
                        canView: p.canView ?? false,
                        canAdd: p.canAdd ?? false,
                        canUpdate: p.canUpdate ?? false,
                        canDelete: p.canDelete ?? false,
                        canPost: p.canPost ?? false,
                    })),
                });
            }

            return updated;
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث الدور ${role.name}`,
            },
        });

        return { message: 'Role updated successfully', role: updatedRole };
    }

    // ✅ Delete role (and permissions)
    async deleteRole(currentUser, id: number) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role) throw new NotFoundException('Role not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        await this.prisma.$transaction([
            this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
            this.prisma.role.delete({ where: { id } }),
        ]);

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف الدور ${role.name}`,
            },
        });

        return { message: 'Role deleted successfully' };
    }
}