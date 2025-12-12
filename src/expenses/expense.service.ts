import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class ExpenseService {
    constructor(private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    async createExpenseJournal(
        userId: number,
        amount: number,
        description: string,
    ) {
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: '11000' },
        });

        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: "51000" },
        });

        if (!bankAccount || !expensesAccount)
            throw new BadRequestException('Missing required accounts setup');

        if (amount > bankAccount.balance)
            throw new BadRequestException('رصيد الصندوق غير كافي')

        const journal = await this.journalService.createJournal(
            {
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
            },
            userId,
        );

        await this.journalService.postJournal(journal.journal.id, userId);
        return { message: `تم انشاء قيد مصروفات ${journal.journal.id} بمبلغ ${amount}` };;
    }

    async getExpensesAccountData(page: number = 1, limit: number = 10) {
        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: '51000' },
        });

        if (!expensesAccount)
            throw new BadRequestException('Expenses account not found');

        // Count total entries
        const total = await this.prisma.journalLine.count({
            where: { accountId: expensesAccount.id },
        });

        // Fetch paginated journal entries
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

    async updateExpense(
        userId: number,
        journalId: number,
        newAmount: number,
        newDescription: string,
    ) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: true },
        });

        if (!journal) throw new BadRequestException("القيد غير موجود");
        if (journal.sourceType !== "EXPENSES")
            throw new BadRequestException("هذا القيد ليس من نوع المصروفات");

        // Accounts
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
        });
        const expensesAccount = await this.prisma.account.findUnique({
            where: { code: "51000" },
        });

        if (!bankAccount || !expensesAccount)
            throw new BadRequestException("Missing account setup");

        const currentCreditInBank = journal.lines
            .filter(line => line.accountId === bankAccount.id)
            .reduce((sum, line) => sum + line.credit, 0);

        const effectiveBankBalance = bankAccount.balance + currentCreditInBank;

        if (newAmount > effectiveBankBalance) {
            throw new BadRequestException("رصيد الصندوق غير كافي بعد التعديل");
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

    async deleteExpense(userId: number, journalId: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
        });

        if (!journal) throw new BadRequestException("القيد غير موجود");
        if (journal.sourceType !== "EXPENSES")
            throw new BadRequestException("هذا القيد ليس من نوع المصروفات");

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
}