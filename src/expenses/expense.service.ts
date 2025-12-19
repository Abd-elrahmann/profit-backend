import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalStatus, JournalSourceType } from '@prisma/client';

@Injectable()
export class ExpenseService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private async getBankAccount() {
        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bank) throw new BadRequestException('حساب الصندوق غير موجود');
        return bank;
    }

    async createExpenseJournal(
        userId: number,
        expenses: { type: string; amount: number; description?: string }[],
    ) {
        if (!expenses || expenses.length === 0)
            throw new BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');

        const bank = await this.getBankAccount();
        const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

        if (totalAmount > bank.balance)
            throw new BadRequestException('رصيد الصندوق غير كافي');

        const journalLines = await Promise.all(
            expenses.map(async (e) => {
                const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                if (!expenseAccount) throw new BadRequestException('حساب المصروفات غير موجود');

                return {
                    accountId: expenseAccount.id,
                    debit: e.amount,
                    credit: 0,
                    description: e.description || e.type,
                };
            }),
        );

        // إضافة خط البنك
        journalLines.push({
            accountId: bank.id,
            debit: 0,
            credit: totalAmount,
            description: 'صرف المصروفات',
        });

        const journal = await this.journalService.createJournal(
            {
                reference: `EXP-${Date.now()}`,
                description: 'صرف مصروفات متعددة الأنواع',
                type: 'GENERAL',
                sourceType: JournalSourceType.EXPENSES,
                lines: journalLines,
            },
            userId,
        );

        await this.journalService.postJournal(journal.journal.id, userId);

        // Audit log
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
        const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
        if (!expenseAccount) throw new BadRequestException('حساب المصروفات غير موجود');

        // جلب جميع journal lines للصفحة المطلوبة
        const entries = await this.prisma.journalLine.findMany({
            where: { accountId: expenseAccount.id },
            include: { journal: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        // دمج lines حسب journalId
        const journalsMap: Record<number, any> = {};
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
                type: line.description, // يمكنك تعديلها لتكون نوع المصروف إذا خزنت النوع
                amount: line.debit || line.credit,
                debit: line.debit,
                credit: line.credit,
            });

            journalsMap[jId].totalDebit += line.debit;
            journalsMap[jId].totalCredit += line.credit;
        });

        const journals = Object.values(journalsMap);

        return {
            total: journals.length,
            page,
            limit,
            account: {
                id: expenseAccount.id,
                code: expenseAccount.code,
                name: expenseAccount.name,
                totalDebit: journals.reduce((sum, j) => sum + j.totalDebit, 0),
                totalCredit: journals.reduce((sum, j) => sum + j.totalCredit, 0),
                balance: journals.reduce((sum, j) => sum + j.totalDebit - j.totalCredit, 0),
            },
            journals,
        };
    }

    async updateExpense(
        userId: number,
        journalId: number,
        expenses: { type: string; amount: number; description?: string }[],
    ) {
        if (!expenses || expenses.length === 0)
            throw new BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');

        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: true },
        });

        if (!journal) throw new BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new BadRequestException('هذا القيد ليس من نوع المصروفات');

        const bank = await this.getBankAccount();
        const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

        const currentCreditInBank = journal.lines
            .filter((l) => l.accountId === bank.id)
            .reduce((sum, l) => sum + l.credit, 0);

        const effectiveBankBalance = bank.balance + currentCreditInBank;
        if (totalAmount > effectiveBankBalance)
            throw new BadRequestException('رصيد الصندوق غير كافي بعد التعديل');

        const isPosted = journal.status === JournalStatus.POSTED;
        if (isPosted) await this.journalService.unpostJournal(userId, journalId);

        const journalLines = await Promise.all(
            expenses.map(async (e) => {
                const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                if (!expenseAccount) throw new BadRequestException('حساب المصروفات غير موجود');

                return {
                    accountId: expenseAccount.id,
                    debit: e.amount,
                    credit: 0,
                    description: e.description || e.type,
                };
            }),
        );

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

        if (isPosted) await this.journalService.postJournal(journalId, userId);

        // Audit log
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

    async deleteExpense(userId: number, journalId: number) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id: journalId } });
        if (!journal) throw new BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new BadRequestException('هذا القيد ليس من نوع المصروفات');

        await this.journalService.unpostJournal(userId, journalId);
        await this.prisma.journalLine.deleteMany({ where: { journalId } });
        await this.prisma.journalHeader.delete({ where: { id: journalId } });

        // Audit log
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
}