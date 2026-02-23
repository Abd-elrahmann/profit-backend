import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

const DASHBOARD_SECTIONS = [
    'client-stats',
    'partner-stats',
    'loan-stats',
    'monthly-collection',
    'expense-stats',
    'Upcoming-Repayments',
    'Last-Actions',
];

@Injectable()
export class RolesService {
    constructor(private prisma: PrismaService) { }


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
            canExport?: boolean;
        }[];
    }) {
        const exists = await this.prisma.role.findUnique({ where: { name: data.name } });
        if (exists) throw new BadRequestException('اسم الدور موجود بالفعل');

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
                        canExport: p.canExport ?? false,
                    })),
                },
            },
            include: { permissions: true },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'CREATE',
                description: `المستخدم ${user?.name} أنشأ الدور ${role.name}`,
            },
        });

        return { message: 'تم انشاء الدور بنجاح', role };
    }


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
                canExport: p.canExport,
            })),
        };
    }


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
                canExport?: boolean;
            }[];
        },
    ) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role) throw new NotFoundException('Role not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const updatedRole = await this.prisma.$transaction(async (tx) => {

            const updated = await tx.role.update({
                where: { id },
                data: { name: data.name ?? role.name, description: data.description ?? role.description },
            });

            if (data.permissions) {
                await tx.rolePermission.deleteMany({
                    where: {
                        roleId: id,
                        module: { notIn: DASHBOARD_SECTIONS },
                    },
                });

                await tx.rolePermission.createMany({
                    data: data.permissions.map((p) => ({
                        roleId: id,
                        module: p.module,
                        canView: p.canView ?? false,
                        canAdd: p.canAdd ?? false,
                        canUpdate: p.canUpdate ?? false,
                        canDelete: p.canDelete ?? false,
                        canPost: p.canPost ?? false,
                        canExport: p.canExport ?? false,
                    })),
                });
            }

            return updated;
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'UPDATE',
                description: `المستخدم ${user?.name} حدث الدور ${role.name}`,
            },
        });

        return { message: 'تم تعديل الدور بنجاح', role: updatedRole };
    }


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


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Roles',
                action: 'DELETE',
                description: `المستخدم ${user?.name} حذف الدور ${role.name}`,
            },
        });

        return { message: 'تم حذف الدور بنجاح' };
    }

    async addDashboardPermissions(
        currentUser: number,
        roleId: number,
        permissions: {
            module: string;
            canView?: boolean;
        }[],
    ) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');

        const permission = await this.prisma.rolePermission.findFirst({ where: { roleId: roleId, module: "dashboard", canView: true } });
        if (!permission) throw new NotFoundException('ليس لديه صلاحيه للداشبورد ');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        return await this.prisma.$transaction(async (tx) => {
            for (const p of permissions) {
                const existing = await tx.rolePermission.findFirst({
                    where: { roleId, module: p.module },
                });

                if (existing) {
                    await tx.rolePermission.update({
                        where: { id: existing.id },
                        data: { canView: p.canView ?? false },
                    });
                } else {
                    await tx.rolePermission.create({
                        data: {
                            roleId,
                            module: p.module,
                            canView: p.canView ?? false,
                        },
                    });
                }
            }

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Roles',
                    action: 'UPDATE',
                    description: `المستخدم ${user?.name} عدّل صلاحيات Dashboard للدور ${role.name}`,
                },
            });

            return {
                message: 'تم تحديث صلاحيات الداشبورد بنجاح',
            };
        });
    }

    async getDashboardPermissions(roleId: number) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role) throw new NotFoundException('Role not found');

        const basePermission = await this.prisma.rolePermission.findFirst({
            where: { roleId: roleId, module: 'dashboard', canView: true },
        });
        if (!basePermission) throw new NotFoundException('ليس لديه صلاحيه للداشبورد ');

        const existing = await this.prisma.rolePermission.findMany({
            where: {
                roleId,
                module: { in: DASHBOARD_SECTIONS },
            },
        });

        const normalized = DASHBOARD_SECTIONS.map((module) => {
            const found = existing.find((p) => p.module.toLowerCase() === module.toLowerCase());
            return {
                module,
                canView: found?.canView ?? false,
            };
        });

        return { permissions: normalized };
    }
}