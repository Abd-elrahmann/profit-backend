import { BadRequestException, Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalStatus, JournalSourceType, AccountBasicType, JournalType } from '@prisma/client';
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

    private async getExpenseAccountId(): Promise<number> {
        const expenseAccount = await this.prisma.account.findUnique({ where: { code: '51000' } });
        if (!expenseAccount) throw new BadRequestException('حساب المصروفات العامة غير موجود');
        return expenseAccount.id;
    }

    async uploadExpenseVoucher(currentUser: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('لم يتم رفع أي ملف');
        const uploadDir = path.join(process.cwd(), 'uploads', 'expenses');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const fileExt = path.parse(file.originalname).ext || '.pdf';
        const fileName = `EXPENSE_VOUCHER_${currentUser}_${Date.now()}${fileExt}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${relPath}`;
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
        expenses: { type: string; amount: number; description?: string; userId?: number; openingJournalLineId?: number }[],
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
                    openingJournalLineId: e.openingJournalLineId || null,
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
                openingJournalLine: {
                    select: {
                        id: true,
                        journalId: true,
                        accountId: true,
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
                openingJournalLineId: e.openingJournalLineId,
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
        expenses: { type: string; amount: number; description?: string; userId?: number; openingJournalLineId?: number }[],
    ) {
        if (!expenses?.length)
            throw new BadRequestException('يجب إضافة نوع واحد على الأقل من المصروفات');

        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: { include: { account: true } } },
        });

        if (!journal)
            throw new BadRequestException('القيد غير موجود');

        if (journal.sourceType !== JournalSourceType.EXPENSES)
            throw new BadRequestException('هذا القيد ليس من نوع المصروفات');

        const bank = await this.getBankAccount();
        const expenseAccountId = await this.getExpenseAccountId();

        const oldExpenses = await this.prisma.expenseRecord.findMany({
            where: { journalId },
        });

        const adjustmentLines: any[] = [];
        let netBankEffect = 0;

        // Old total per type
        const oldMap = new Map<string, number>();
        for (const oldExp of oldExpenses) {
            oldMap.set(oldExp.type, new Decimal(oldExp.amount).toNumber());
        }

        // New total per type
        const newMap = new Map<string, number>();
        for (const newExp of expenses) {
            const existing = newMap.get(newExp.type) || 0;
            newMap.set(newExp.type, new Decimal(existing).plus(new Decimal(newExp.amount)).toNumber());
        }

        // Collect all unique types from both old and new
        const allTypes = new Set([...oldMap.keys(), ...newMap.keys()]);

        for (const type of allTypes) {
            const oldAmount = oldMap.get(type) || 0;
            const newAmount = newMap.get(type) || 0;
            const diff = new Decimal(newAmount).minus(new Decimal(oldAmount)).toNumber();

            if (diff === 0) continue;

            if (diff > 0) {
                // Increased or new expense → debit expense
                adjustmentLines.push({
                    accountId: expenseAccountId,
                    debit: diff,
                    credit: 0,
                    description: `تعديل مصروف (زيادة) - ${type}`,
                });
                netBankEffect += diff;
            } else {
                // Decreased or removed expense → credit expense
                adjustmentLines.push({
                    accountId: expenseAccountId,
                    debit: 0,
                    credit: Math.abs(diff),
                    description: `تعديل مصروف (نقص) - ${type}`,
                });
                netBankEffect -= Math.abs(diff);
            }
        }

        if (adjustmentLines.length > 0) {
            // Single bank counter-entry
            adjustmentLines.push({
                accountId: bank.id,
                debit: netBankEffect < 0 ? Math.abs(netBankEffect) : 0,
                credit: netBankEffect > 0 ? netBankEffect : 0,
                description: 'تعديل بنكي للمصروفات',
            });

            const adjustmentJournal = await this.journalService.createJournal(
                {
                    reference: `EXP-ADJ-${journalId}-${Date.now()}`,
                    description: 'تعديل مصروفات',
                    type: JournalType.ADJUSTMENT,
                    sourceType: JournalSourceType.EXPENSES,
                    sourceId: journalId,
                    lines: adjustmentLines,
                },
                userId,
            );

            const settings = await this.prisma.settings.findFirst();
            if (settings?.autoPost) {
                await this.journalService.postJournal(adjustmentJournal.journal.id, userId);
            }
        }

        // Replace expense records
        await this.prisma.expenseRecord.deleteMany({ where: { journalId } });
        await this.prisma.expenseRecord.createMany({
            data: expenses.map(e => ({
                userId,
                type: e.type,
                amount: e.amount,
                description: e.description || e.type,
                employeeId: e.userId || null,
                journalId,
                openingJournalLineId: e.openingJournalLineId || null,
            })),
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Expenses',
                action: 'UPDATE',
                description: `تم تعديل قيد مصروفات ${journalId}`,
            },
        });

        return { message: 'تم تعديل قيد المصروفات بنجاح', journalId };
    }

    async deleteExpense(userId: number, journalId: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id: journalId },
            include: { lines: { include: { account: true } } },
        });

        if (!journal) throw new BadRequestException('القيد غير موجود');
        if (journal.sourceType !== 'EXPENSES')
            throw new BadRequestException('هذا القيد ليس من نوع المصروفات');

        const isOpeningJournal = journal.type === JournalType.OPENING;

        const expenseLines = journal.lines.filter(
            l => l.account.accountBasicType === AccountBasicType.EXPENSES
        );
        const nonExpenseLines = journal.lines.filter(
            l => l.account.accountBasicType !== AccountBasicType.EXPENSES
        );

        if (isOpeningJournal && nonExpenseLines.length > 0) {

            if (journal.status === 'POSTED') {
                await this.journalService.unpostJournal(userId, journalId);
            }
            const bank = await this.getBankAccount();
            const totalExpenseAmount = expenseLines.reduce(
                (sum, l) => new Decimal(sum).plus(new Decimal(l.debit || 0)).toNumber(),
                0
            );

            await this.prisma.journalLine.createMany({
                data: [
                    ...expenseLines.map(l => ({
                        journalId,
                        accountId: l.accountId,
                        debit: 0,
                        credit: l.debit,
                        description: `عكس - ${l.description || ''}`,
                    })),
                    {
                        journalId,
                        accountId: bank.id,
                        debit: totalExpenseAmount,
                        credit: 0,
                        description: 'عكس بنكي للمصروفات الافتتاحية',
                    },
                ],
            });
            
            if (journal.status === 'POSTED') {
                await this.journalService.postJournal(journalId, userId);
            }

            await this.prisma.expenseRecord.deleteMany({ where: { journalId } });
        } else {
            // Safe to delete the whole journal
            if (journal.status === 'POSTED') {
                await this.journalService.unpostJournal(userId, journalId);
            }

            await this.prisma.expenseRecord.deleteMany({ where: { journalId } });
            await this.prisma.journalLine.deleteMany({ where: { journalId } });
            await this.prisma.journalHeader.delete({ where: { id: journalId } });
        }

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Expenses',
                action: 'DELETE',
                description: `تم حذف مصروفات القيد ${journalId}`,
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