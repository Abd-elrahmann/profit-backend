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
exports.BankService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let BankService = class BankService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createBankAccount(currentUser, data) {
        const existing = await this.prisma.bANK_accounts.findFirst({
            where: { accountNumber: data.accountNumber },
        });
        if (existing) {
            throw new common_1.BadRequestException('رقم الحساب موجود مسبقاً.');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const createData = {
            ...data,
            status: data.limit > 0 ? 'Active' : 'Expired'
        };
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء حساب بنكي جديد: ${data.name}`,
            },
        });
        return this.prisma.bANK_accounts.create({ data: createData });
    }
    async getAllBankAccounts(page = 1, limit = 10, filters) {
        const where = {};
        if (filters?.search) {
            const search = filters.search.trim();
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { IBAN: { contains: search, mode: 'insensitive' } },
                { owner: { contains: search, mode: 'insensitive' } },
                {
                    accountNumber: {
                        equals: isNaN(Number(search)) ? undefined : Number(search),
                    },
                },
            ];
        }
        const accounts = await this.prisma.bANK_accounts.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });
        const total = await this.prisma.bANK_accounts.count({ where });
        return { total, page, limit, data: accounts };
    }
    async getBankAccountById(id) {
        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id },
            include: {
                loans: {
                    include: {
                        client: { select: { name: true, phone: true } },
                        partner: { select: { name: true } },
                    },
                },
            },
        });
        if (!bankAccount)
            throw new common_1.NotFoundException('Bank account not found.');
        return bankAccount;
    }
    async updateBankAccount(currentUser, id, data) {
        const existing = await this.prisma.bANK_accounts.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('Bank account not found.');
        if (data.accountNumber && data.accountNumber !== existing.accountNumber) {
            const duplicate = await this.prisma.bANK_accounts.findFirst({
                where: { accountNumber: data.accountNumber },
            });
            if (duplicate)
                throw new common_1.BadRequestException('رقم الحساب موجود مسبقاً.');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const updateData = { ...data };
        if (data.limit !== undefined) {
            updateData.status = data.limit > 0 ? 'Active' : 'Expired';
        }
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث الحساب البنكي: ${existing.name}`,
            },
        });
        return this.prisma.bANK_accounts.update({
            where: { id },
            data: updateData,
        });
    }
    async deleteBankAccount(currentUser, id) {
        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id },
            include: { loans: true },
        });
        if (!bankAccount)
            throw new common_1.NotFoundException('Bank account not found.');
        if (bankAccount.loans.length > 0) {
            throw new common_1.BadRequestException('لا يمكن حذف الحساب البنكي لارتباطه بسلف.');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'DELETE',
                description: `قام المستخدم ${user?.name} بحذف الحساب البنكي: ${bankAccount.name}`,
            },
        });
        return this.prisma.bANK_accounts.delete({ where: { id } });
    }
};
exports.BankService = BankService;
exports.BankService = BankService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], BankService);
//# sourceMappingURL=bank.service.js.map