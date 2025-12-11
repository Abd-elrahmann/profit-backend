"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const luxon_1 = require("luxon");
const DASHBOARD_SECTIONS = [
    'client-stats',
    'partner-stats',
    'loan-stats',
    'monthly-collection',
    'Upcoming-Repayments',
    'Last-Actions',
];
let RolesService = class RolesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createRole(currentUser, data) {
        const exists = await this.prisma.role.findUnique({ where: { name: data.name } });
        if (exists)
            throw new common_1.BadRequestException('اسم الدور موجود بالفعل');
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
    async getRoles(filters) {
        const where = {};
        if (filters?.id)
            where.id = filters.id;
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        const unformattedRoles = await this.prisma.role.findMany({
            where,
            include: { permissions: true },
            orderBy: { id: 'asc' },
        });
        const roles = unformattedRoles.map((role) => ({
            ...role,
            createdAt: role.createdAt
                ? luxon_1.DateTime.fromJSDate(role.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            updatedAt: role.updatedAt
                ? luxon_1.DateTime.fromJSDate(role.updatedAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
        }));
        return { total: roles.length, roles };
    }
    async getUserPermissions(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                role: {
                    include: { permissions: true },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.role)
            return { permissions: [] };
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
    async updateRole(id, currentUser, data) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const updatedRole = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.role.update({
                where: { id },
                data: { name: data.name ?? role.name, description: data.description ?? role.description },
            });
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
    async deleteRole(currentUser, id) {
        const role = await this.prisma.role.findUnique({ where: { id } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
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
    async addDashboardPermissions(currentUser, roleId, permissions) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        const permission = await this.prisma.rolePermission.findFirst({ where: { roleId: roleId, module: "dashboard", canView: true } });
        if (!permission)
            throw new common_1.NotFoundException('ليس لديه صلاحيه للداشبورد ');
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
                }
                else {
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
    async getDashboardPermissions(roleId) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        const basePermission = await this.prisma.rolePermission.findFirst({
            where: { roleId: roleId, module: 'dashboard', canView: true },
        });
        if (!basePermission)
            throw new common_1.NotFoundException('ليس لديه صلاحيه للداشبورد ');
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
};
exports.RolesService = RolesService;
exports.RolesService = RolesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RolesService);
//# sourceMappingURL=roles.service.js.map