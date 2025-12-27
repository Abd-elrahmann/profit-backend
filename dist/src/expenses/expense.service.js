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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const client_1 = require("@prisma/client");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let ExpenseService = class ExpenseService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async getBankAccount() {
        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bank)
            throw new common_1.BadRequestException('حساب الصندوق غير موجود');
        return bank;
    }
    async createExpenseJournal(userId, expenses) {
        if (!expenses || expenses.length === 0)
            throw new common_1.BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');
        const bank = await this.getBankAccount();
        const totalAmount = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
        if (totalAmount > bank.balance)
            throw new common_1.BadRequestException('رصيد الصندوق غير كافي');
        const journalLines = await Promise.all(expenses.map(async (e) => {
            let expenseAccountId;
            let description = e.description || e.type;
            if (e.type === 'مصروف رواتب') {
                if (!e.userId)
                    throw new common_1.BadRequestException('يجب تحديد الموظف عند إضافة مصروف رواتب');
                const employee = await this.prisma.user.findUnique({
                    where: { id: e.userId },
                    select: { name: true, expenseAccountId: true },
                });
                if (!employee?.expenseAccountId)
                    throw new common_1.BadRequestException(`لا يوجد حساب مصروفات للموظف ${employee?.name}`);
                expenseAccountId = employee.expenseAccountId;
                description = `${description} - ${employee.name}`;
            }
            else {
                const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                if (!expenseAccount)
                    throw new common_1.BadRequestException('حساب المصروفات العامة غير موجود');
                expenseAccountId = expenseAccount.id;
            }
            return {
                accountId: expenseAccountId,
                debit: e.amount,
                credit: 0,
                description,
            };
        }));
        journalLines.push({
            accountId: bank.id,
            debit: 0,
            credit: totalAmount,
            description: 'صرف المصروفات',
        });
        const journal = await this.journalService.createJournal({
            reference: `EXP-${Date.now()}`,
            description: 'صرف مصروفات متعددة الأنواع',
            type: 'GENERAL',
            sourceType: client_1.JournalSourceType.EXPENSES,
            lines: journalLines,
        }, userId);
        await this.journalService.postJournal(journal.journal.id, userId);
        await Promise.all(expenses.map(async (e) => {
            await this.prisma.expenseRecord.create({
                data: {
                    userId,
                    type: e.type,
                    amount: e.amount,
                    description: e.description || e.type,
                    employeeId: e.userId || null,
                    journalId: journal.journal.id,
                },
            });
        }));
        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Expenses',
                action: 'CREATE',
                description: `تم إنشاء قيد مصروفات ${journal.journal.id} بمبلغ ${totalAmount}`,
            },
        });
        return { message: `تم انشاء قيد مصروفات ${journal.journal.id} بمبلغ ${totalAmount}`, journalId: journal.journal.id };
    }
    async getExpensesAccountData(page = 1, limit = 10) {
        const entries = await this.prisma.journalLine.findMany({
            where: {
                journal: {
                    sourceType: client_1.JournalSourceType.EXPENSES,
                },
            },
            include: {
                journal: true,
                account: true,
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });
        const journalsMap = {};
        entries.forEach((line) => {
            const jId = line.journalId;
            if (!journalsMap[jId]) {
                journalsMap[jId] = {
                    journalId: jId,
                    journalReference: line.journal.reference,
                    description: line.journal.description,
                    lines: [],
                    totalDebit: 0,
                    totalCredit: 0,
                    date: line.journal.date,
                };
            }
            journalsMap[jId].lines.push({
                type: line.description,
                amount: line.debit || line.credit,
                debit: line.debit,
                credit: line.credit,
                accountName: line.account?.name,
                accountCode: line.account?.code,
            });
            journalsMap[jId].totalDebit += Math.round(line.debit * 100) / 100;
            journalsMap[jId].totalCredit += Math.round(line.credit * 100) / 100;
        });
        const journals = Object.values(journalsMap);
        const totalDebit = journals.reduce((sum, j) => sum + Math.round(j.totalDebit * 100), 0) / 100;
        const totalCredit = journals.reduce((sum, j) => sum + Math.round(j.totalCredit * 100), 0) / 100;
        return {
            total: journals.length,
            page,
            limit,
            account: {
                totalDebit,
                totalCredit,
                balance: totalDebit - totalCredit,
            },
            journals,
        };
    }
    async getExpensesRecords(page = 1, limit = 10) {
        const skip = (page - 1) * limit;
        const expenses = await this.prisma.expenseRecord.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                employee: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });
        const total = await this.prisma.expenseRecord.count();
        return {
            total,
            page,
            limit,
            expenses: expenses.map(e => ({
                id: e.id,
                journal: e.journalId,
                type: e.type,
                amount: e.amount,
                description: e.description,
                createdAt: e.createdAt,
                createdAtHijri: this.toHijri(e.createdAt),
                addedBy: e.user ? { id: e.user.id, name: e.user.name, email: e.user.email } : null,
                employee: e.employee ? { id: e.employee.id, name: e.employee.name, email: e.employee.email } : null,
            })),
        };
    }
    async updateExpense(userId, journalId, expenses) {
        if (!expenses || expenses.length === 0)
            throw new common_1.BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: true },
        });
        if (!journal)
            throw new common_1.BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new common_1.BadRequestException('هذا القيد ليس من نوع المصروفات');
        const bank = await this.getBankAccount();
        const totalAmount = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;
        const currentCreditInBank = journal.lines
            .filter((l) => l.accountId === bank.id)
            .reduce((sum, l) => sum + l.credit, 0);
        const effectiveBankBalance = bank.balance + currentCreditInBank;
        if (totalAmount > effectiveBankBalance)
            throw new common_1.BadRequestException('رصيد الصندوق غير كافي بعد التعديل');
        const isPosted = journal.status === client_1.JournalStatus.POSTED;
        if (isPosted)
            await this.journalService.unpostJournal(userId, journalId);
        const journalLines = await Promise.all(expenses.map(async (e) => {
            let expenseAccountId;
            let description = e.description || e.type;
            if (e.type === 'مصروف رواتب') {
                if (!e.userId)
                    throw new common_1.BadRequestException('يجب تحديد الموظف عند إضافة مصروف رواتب');
                const employee = await this.prisma.user.findUnique({
                    where: { id: e.userId },
                    select: { name: true, expenseAccountId: true },
                });
                if (!employee?.expenseAccountId)
                    throw new common_1.BadRequestException(`لا يوجد حساب مصروفات للموظف ${employee?.name}`);
                expenseAccountId = employee.expenseAccountId;
                description = `${description} - ${employee.name}`;
            }
            else {
                const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                if (!expenseAccount)
                    throw new common_1.BadRequestException('حساب المصروفات العامة غير موجود');
                expenseAccountId = expenseAccount.id;
            }
            return {
                accountId: expenseAccountId,
                debit: e.amount,
                credit: 0,
                description,
            };
        }));
        journalLines.push({
            accountId: bank.id,
            debit: 0,
            credit: totalAmount,
            description: 'صرف المصروفات',
        });
        await this.prisma.journalHeader.update({
            where: { id: journalId },
            data: {
                description: 'صرف مصروفات متعددة الأنواع',
                reference: `EXP-${journalId}-${Date.now()}`,
                lines: { deleteMany: {}, create: journalLines },
            },
        });
        if (isPosted)
            await this.journalService.postJournal(journalId, userId);
        await this.prisma.expenseRecord.deleteMany({ where: { journalId } });
        await Promise.all(expenses.map(async (e) => {
            await this.prisma.expenseRecord.create({
                data: {
                    userId,
                    type: e.type,
                    amount: e.amount,
                    description: e.description || e.type,
                    employeeId: e.userId || null,
                    journalId,
                },
            });
        }));
        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Expenses',
                action: 'UPDATE',
                description: `تم تعديل قيد مصروفات ${journalId} بمبلغ ${totalAmount}`,
            },
        });
        return { message: 'تم تعديل قيد المصروفات بنجاح', journalId };
    }
    async deleteExpense(userId, journalId) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id: journalId } });
        if (!journal)
            throw new common_1.BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new common_1.BadRequestException('هذا القيد ليس من نوع المصروفات');
        await this.journalService.unpostJournal(userId, journalId);
        await this.prisma.expenseRecord.deleteMany({ where: { journalId } });
        await this.prisma.journalLine.deleteMany({ where: { journalId } });
        await this.prisma.journalHeader.delete({ where: { id: journalId } });
        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Expenses',
                action: 'DELETE',
                description: `تم حذف قيد مصروفات ${journalId}`,
            },
        });
        return { message: 'تم حذف قيد المصروفات بنجاح', journalId };
    }
    async getUsersForExpenses() {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                expenseAccountId: true,
                isActive: true,
            },
            orderBy: { name: 'asc' },
        });
        return users;
    }
};
exports.ExpenseService = ExpenseService;
exports.ExpenseService = ExpenseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], ExpenseService);
//# sourceMappingURL=expense.service.js.map