"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcrypt"));
const luxon_1 = require("luxon");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async generateNextCode(prefix) {
        const latest = await this.prisma.account.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
        });
        const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}0000`;
        return nextCode;
    }
    async addUser(currentUser, data) {
        const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
        if (existingEmail)
            throw new common_1.BadRequestException('الايميل موجود بالفعل');
        const existingPhone = await this.prisma.user.findUnique({ where: { phone: data.phone } });
        if (existingPhone)
            throw new common_1.BadRequestException('الرقم موجود بالفعل');
        const current = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const hashed = await bcrypt.hash(data.password, 10);
        const expenses = await this.prisma.account.findUnique({ where: { code: '52000' } });
        if (!expenses) {
            throw new common_1.BadRequestException('expense accounts (52000) must exist first');
        }
        const expensesAccount = await this.prisma.account.create({
            data: {
                name: `مصروفات - ${data.name}`,
                code: await this.generateNextCode('52'),
                parentId: expenses.id,
                type: 'EXPENSE',
                nature: 'DEBIT',
                accountBasicType: 'EXPENSES',
                level: 3,
            },
        });
        const user = await this.prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                password: hashed,
                roleId: data.roleId,
                expenseAccountId: expensesAccount.id,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                roleId: true,
                role: {
                    select: {
                        name: true
                    }
                },
                createdAt: true
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Users',
                action: 'CREATE',
                description: `المستخدم ${current?.name} أضاف مستخدم جديد ${data.name}`,
            },
        });
        return { message: 'تم اضافة مستخدم جديد بنجاح', user };
    }
    async updateUser(id, currentUser, data) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (data.phone && data.phone !== user.phone) {
            const phoneExists = await this.prisma.user.findUnique({ where: { phone: data.phone } });
            if (phoneExists)
                throw new common_1.BadRequestException('الرقم موجود بالفعل');
        }
        const current = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const updated = await this.prisma.user.update({
            where: { id },
            data: {
                name: data.name ?? user.name,
                phone: data.phone ?? user.phone,
                isActive: data.isActive ?? user.isActive,
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
                role: {
                    select: {
                        name: true
                    }
                },
                updatedAt: true
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Users',
                action: 'UPDATE',
                description: `المستخدم ${current?.name} قام بتحديث بيانات المستخدم ${user.name}`,
            },
        });
        return { message: 'تم تحديث بيانات المستخدم بنجاح', user: updated };
    }
    async deleteUser(currentUser, id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (user.id == 1)
            throw new common_1.NotFoundException('لا يمكن حذف المستخدم ');
        const current = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.auditLog.deleteMany({ where: { userId: id } });
        await this.prisma.resetPasswordToken.deleteMany({ where: { userId: id } });
        await this.prisma.journalHeader.updateMany({
            where: { postedById: id },
            data: { postedById: null },
        });
        await this.prisma.user.delete({ where: { id } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Users',
                action: 'DELETE',
                description: `المستخدم ${current?.name} قام بحذف المستخدم ${user.name}`,
            },
        });
        return { message: 'تم حذف المستخدم بنجاح' };
    }
    async getUsers(page = 1, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.email)
            where.email = { contains: filters.email, mode: 'insensitive' };
        if (filters?.phone)
            where.phone = { contains: filters.phone, mode: 'insensitive' };
        if (filters?.roleId)
            where.roleId = filters.roleId;
        const totalUsers = await this.prisma.user.count({ where });
        const totalPages = Math.ceil(totalUsers / limit);
        if (page > totalPages && totalUsers > 0)
            throw new common_1.NotFoundException('Page not found');
        const unformattedUsers = await this.prisma.user.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                roleId: true,
                role: {
                    select: {
                        name: true
                    }
                },
                isActive: true,
                createdAt: true
            },
        });
        const users = unformattedUsers.map((user) => ({
            ...user,
            createdAt: luxon_1.DateTime.fromJSDate(user.createdAt, { zone: 'utc' })
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd HH:mm:ss'),
            hijriCreatedAt: this.toHijri(user.createdAt),
        }));
        return {
            totalUsers,
            totalPages,
            currentPage: page,
            users,
        };
    }
    async assignRole(userId, currentUser, roleId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const current = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.user.update({ where: { id: userId }, data: { roleId } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Users',
                action: 'UPDATE',
                description: `المستخدم ${current?.name} قام بتعيين دور جديد للمستخدم ${user.name}`,
            },
        });
        return { message: 'تم تعيين الدور بنجاح' };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map