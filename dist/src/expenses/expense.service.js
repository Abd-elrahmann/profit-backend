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
exports.ExpenseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
let ExpenseService = class ExpenseService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    async createExpenseJournal(userId, amount, description) {
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: '11000' },
        });
        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: "51000" },
        });
        if (!bankAccount || !expensesAccount)
            throw new common_1.BadRequestException('Missing required accounts setup');
        if (amount > bankAccount.balance)
            throw new common_1.BadRequestException('رصيد الصندوق غير كافي');
        const journal = await this.journalService.createJournal({
            reference: `EXP-${Date.now()}`,
            description,
            type: 'GENERAL',
            sourceType: 'EXPENSES',
            lines: [
                {
                    accountId: expensesAccount.id,
                    debit: amount,
                    credit: 0,
                    description: description,
                },
                {
                    accountId: bankAccount.id,
                    debit: 0,
                    credit: amount,
                    description: description,
                },
            ],
        }, userId);
        await this.journalService.postJournal(journal.journal.id, userId);
        return { message: `تم انشاء قيد مصروفات ${journal.journal.id} بمبلغ ${amount}` };
        ;
    }
    async getExpensesAccountData(page = 1, limit = 10) {
        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: '51000' },
        });
        if (!expensesAccount)
            throw new common_1.BadRequestException('Expenses account not found');
        const total = await this.prisma.journalLine.count({
            where: { accountId: expensesAccount.id },
        });
        const entries = await this.prisma.journalLine.findMany({
            where: { accountId: expensesAccount.id },
            include: { journal: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });
        const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
        const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);
        const balance = totalDebit - totalCredit;
        return {
            total,
            page,
            limit,
            account: {
                id: expensesAccount.id,
                code: expensesAccount.code,
                name: expensesAccount.name,
                totalDebit,
                totalCredit,
                balance,
            },
            journals: entries.map((e) => ({
                journalId: e.journalId,
                journalReference: e.journal.reference,
                description: e.description,
                debit: e.debit,
                credit: e.credit,
                date: e.journal.date,
            })),
        };
    }
    async updateExpense(userId, journalId, newAmount, newDescription) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: true },
        });
        if (!journal)
            throw new common_1.BadRequestException("القيد غير موجود");
        if (journal.sourceType !== "EXPENSES")
            throw new common_1.BadRequestException("هذا القيد ليس من نوع المصروفات");
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
        });
        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: "51000" },
        });
        if (!bankAccount || !expensesAccount)
            throw new common_1.BadRequestException("Missing account setup");
        const currentCreditInBank = journal.lines
            .filter(line => line.accountId === bankAccount.id)
            .reduce((sum, line) => sum + line.credit, 0);
        const effectiveBankBalance = bankAccount.balance + currentCreditInBank;
        if (newAmount > effectiveBankBalance) {
            throw new common_1.BadRequestException("رصيد الصندوق غير كافي بعد التعديل");
        }
        await this.journalService.unpostJournal(userId, journalId);
        await this.prisma.journalHeader.update({
            where: { id: journalId },
            data: {
                description: newDescription,
                reference: `EXP-${journalId}-${Date.now()}`,
                lines: {
                    deleteMany: {},
                    create: [
                        {
                            accountId: expensesAccount.id,
                            debit: newAmount,
                            credit: 0,
                            description: newDescription,
                        },
                        {
                            accountId: bankAccount.id,
                            debit: 0,
                            credit: newAmount,
                            description: newDescription,
                        },
                    ],
                },
            },
        });
        await this.journalService.postJournal(journalId, userId);
        return {
            message: "تم تعديل قيد المصروفات بنجاح",
            journalId,
        };
    }
    async deleteExpense(userId, journalId) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
        });
        if (!journal)
            throw new common_1.BadRequestException("القيد غير موجود");
        if (journal.sourceType !== "EXPENSES")
            throw new common_1.BadRequestException("هذا القيد ليس من نوع المصروفات");
        await this.journalService.unpostJournal(userId, journalId);
        await this.prisma.journalLine.deleteMany({
            where: { journalId: journalId },
        });
        await this.prisma.journalHeader.delete({
            where: { id: journalId },
        });
        return {
            message: "تم حذف قيد المصروفات بنجاح",
            journalId,
        };
    }
};
exports.ExpenseService = ExpenseService;
exports.ExpenseService = ExpenseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], ExpenseService);
//# sourceMappingURL=expense.service.js.map