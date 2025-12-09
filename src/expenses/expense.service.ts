import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { threadId } from 'worker_threads';

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
}