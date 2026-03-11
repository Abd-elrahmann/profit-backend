import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalStatus, JournalSourceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import moment from "moment-hijri";

@Injectable()
export class ExpenseService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    private async getBankAccount() {
        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bank) throw new BadRequestException('حساب الصندوق غير موجود');
        return bank;
    }

    async uploadExpenseVoucher(currentUser: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
        const uploadDir = path.join(process.cwd(), 'uploads', 'expenses');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const fileExt = path.parse(file.originalname).ext || '.pdf';
        const fileName = `سند_صرف_${currentUser}_${Date.now()}${fileExt}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        return { voucherUrl: publicUrl };
    }

    async getNextExpenseVoucherNumber(): Promise<number> {
        const count = await this.prisma.journalHeader.count({
            where: { sourceType: JournalSourceType.EXPENSES },
        });
        return count + 1;
    }

    async createExpenseJournal(
        userId: number,
        expenses: { type: string; amount: number; description?: string; userId?: number }[],
        voucherUrl?: string,
        reference?: string,
    ) {
        if (!expenses || expenses.length === 0)
            throw new BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');

        const bank = await this.getBankAccount();
        const totalAmount = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;




        const journalLines = await Promise.all(
            expenses.map(async (e) => {
                let expenseAccountId: number;
                let description = e.description || e.type;

                if (e.type === 'مصروف رواتب') {
                    if (!e.userId) throw new BadRequestException('يجب تحديد الموظف عند إضافة مصروف رواتب');

                    const employee = await this.prisma.user.findUnique({
                        where: { id: e.userId },
                        select: { name: true, expenseAccountId: true },
                    });

                    if (!employee?.expenseAccountId)
                        throw new BadRequestException(`لا يوجد حساب مصروفات للموظف ${employee?.name}`);

                    expenseAccountId = employee.expenseAccountId;
                    description = `${description} - ${employee.name}`;
                } else {
                    const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                    if (!expenseAccount) throw new BadRequestException('حساب المصروفات العامة غير موجود');
                    expenseAccountId = expenseAccount.id;
                }

                return {
                    accountId: expenseAccountId,
                    debit: e.amount,
                    credit: 0,
                    description,
                };
            }),
        );

        journalLines.push({
            accountId: bank.id,
            debit: 0,
            credit: totalAmount,
            description: 'صرف المصروفات',
        });

        const finalReference = reference || `EXP-${Date.now()}`;
        const journal = await this.journalService.createJournal(
            {
                reference: finalReference,
                description: 'صرف مصروفات متعددة الأنواع',
                type: 'GENERAL',
                sourceType: JournalSourceType.EXPENSES,
                lines: journalLines,
                voucherUrl: voucherUrl || undefined,
            },
            userId,
        );

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, userId);
        }

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
                    sourceType: JournalSourceType.EXPENSES,
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

    async getExpensesRecords(
        page = 1,
        limit = 10,
        types?: string[],
        employeeIds?: number[],
    ) {
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        if (types && types.length > 0) {
            where.type = { in: types };
        }
        if (employeeIds && employeeIds.length > 0) {
            where.employeeId = { in: employeeIds };
        }

        const expenses = await this.prisma.expenseRecord.findMany({
            where,
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
                journal: {
                    select: {
                        id: true,
                        reference: true,
                        voucherUrl: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });

        const total = await this.prisma.expenseRecord.count({ where });

        return {
            total,
            page,
            limit,
            expenses: expenses.map(e => ({
                id: e.id,
                journal: e.journalId,
                journalReference: e.journal?.reference ?? null,
                voucherUrl: e.journal?.voucherUrl ?? null,
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

    async updateExpense(
        userId: number,
        journalId: number,
        expenses: { type: string; amount: number; description?: string; userId?: number }[],
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

        const totalAmount = expenses.reduce((sum, e) => sum + Math.round(e.amount * 100), 0) / 100;

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
                let expenseAccountId: number;
                let description = e.description || e.type;

                if (e.type === 'مصروف رواتب') {
                    if (!e.userId) throw new BadRequestException('يجب تحديد الموظف عند إضافة مصروف رواتب');

                    const employee = await this.prisma.user.findUnique({
                        where: { id: e.userId },
                        select: { name: true, expenseAccountId: true },
                    });

                    if (!employee?.expenseAccountId)
                        throw new BadRequestException(`لا يوجد حساب مصروفات للموظف ${employee?.name}`);

                    expenseAccountId = employee.expenseAccountId;
                    description = `${description} - ${employee.name}`;
                } else {
                    const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
                    if (!expenseAccount) throw new BadRequestException('حساب المصروفات العامة غير موجود');

                    expenseAccountId = expenseAccount.id;
                }

                return {
                    accountId: expenseAccountId,
                    debit: e.amount,
                    credit: 0,
                    description,
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

    async deleteExpense(userId: number, journalId: number) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id: journalId } });
        if (!journal) throw new BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new BadRequestException('هذا القيد ليس من نوع المصروفات');

        if (journal.status == 'POSTED') {
            await this.journalService.unpostJournal(userId, journalId);
        }


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
                phone: true,
                expenseAccountId: true,
                isActive: true,
            },
            orderBy: { name: 'asc' },
        });

        return users;
    }
}