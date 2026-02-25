import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DateTime } from 'luxon';

@Injectable()
export class SmallLoanService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    private toRiyadh(date: Date | null) {
        if (!date) return null;

        return DateTime
            .fromJSDate(date, { zone: 'utc' })
            .setZone('Asia/Riyadh')
            .toFormat('yyyy-LL-dd');
    }

    async create(body: any, currentUser: number) {
        const { Name, amount, notes } = body;

        if (!Name || !amount || amount <= 0)
            throw new BadRequestException('بيانات غير صحيحة');

        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });

        const smallLoanAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'SMALL_LOANS_RECEIVABLE' },
        });

        if (!bank || !smallLoanAccount)
            throw new BadRequestException('الحسابات المحاسبية غير مكتملة');

        if (new Decimal(amount).gt(new Decimal(bank.balance)))
            throw new BadRequestException('رصيد البنك لا يسمح بصرف السلفة');

        return this.prisma.$transaction(async (tx) => {

            const loan = await tx.smallLoan.create({
                data: {
                    Name,
                    amount,
                    remaining: amount,
                    notes,
                },
            });

            const journal = await this.journalService.createJournal(
                {
                    reference: `SMALL-LOAN-${loan.id}`,
                    description: `صرف سلفة صغيرة للمستفيد ${Name}`,
                    sourceType: JournalSourceType.SMALL_LOAN,
                    sourceId: loan.id,
                    lines: [
                        {

                            accountId: smallLoanAccount.id,
                            debit: amount,
                            credit: 0,
                            description: 'إثبات سلفة صغيرة',
                        },
                        {

                            accountId: bank.id,
                            debit: 0,
                            credit: amount,
                            description: 'صرف نقدي سلفة صغيرة',
                        },
                    ],
                },
                currentUser,
            );

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUser);
            }

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Small Loans',
                    action: 'CREATE',
                    description: `تم إنشاء سلفة صغيرة بقيمة ${amount} للمستفيد ${Name}`,
                },
            });

            return loan;
        });
    }

    async getUnpostedJournalsForSmallLoans() {
        const unpostedJournals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: JournalSourceType.SMALL_LOAN,
                status: { not: 'POSTED' },
            },
            orderBy: { id: 'asc' },
        });

        const loanIds = [...new Set(unpostedJournals.map((j) => j.sourceId).filter((id): id is number => id != null))];
        const smallLoans = loanIds.length > 0
            ? await this.prisma.smallLoan.findMany({
                where: { id: { in: loanIds } },
                select: { id: true, Name: true },
            })
            : [];

        const loanMap = Object.fromEntries(smallLoans.map((l) => [l.id, l]));

        const items = unpostedJournals.map((j) => ({
            id: j.id,
            reference: j.reference,
            sourceId: j.sourceId,
            loanName: j.sourceId ? loanMap[j.sourceId]?.Name : null,
        }));

        return {
            count: items.length,
            items,
        };
    }

    async findAll(page = 1, limit = 20, status?: string, clientName?: string) {
        page = Number(page) > 0 ? Number(page) : 1;
        limit = Number(limit) > 0 ? Number(limit) : 20;

        const where: any = {};
        if (status) where.status = status as any;
        if (clientName) where.Name = { contains: clientName, mode: 'insensitive' };

        const [data, total] = await this.prisma.$transaction([
            this.prisma.smallLoan.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.smallLoan.count({ where }),
        ]);

        const formattedData = data.map((loan) => ({
            ...loan,
            createdAt: this.toRiyadh(loan.createdAt),
            closedAt: this.toRiyadh(loan.closedAt),
        }));

        return {
            totalPages: Math.ceil(total / limit),
            page,
            limit,
            total,
            data: formattedData,
        };
    }

    async pay(id: number, body: any, currentUser: number) {
        const { amount, notes } = body;

        if (!amount || amount <= 0)
            throw new BadRequestException('المبلغ غير صحيح');

        const loan = await this.prisma.smallLoan.findUnique({
            where: { id },
        });

        if (!loan) throw new NotFoundException('السلفة غير موجودة');
        if (loan.remaining <= 0)
            throw new BadRequestException('السلفة مسددة بالكامل');

        const payAmount = Math.min(amount, loan.remaining);

        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });

        const smallLoanAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'SMALL_LOANS_RECEIVABLE' },
        });

        if (!bank || !smallLoanAccount)
            throw new BadRequestException('الحسابات المحاسبية غير مكتملة');

        return this.prisma.$transaction(async (tx) => {

            const paymentCount = await tx.journalHeader.count({
                where: {
                    sourceType: JournalSourceType.SMALL_LOAN,
                    sourceId: loan.id,
                },
            });

            const journal = await this.journalService.createJournal(
                {
                    reference: `SMALL-PAY-${loan.id}-${paymentCount + 1}`,
                    description: `سداد سلفة صغيرة للمستفيد ${loan.Name}`,
                    sourceType: JournalSourceType.SMALL_LOAN,
                    sourceId: loan.id,
                    lines: [
                        {

                            accountId: bank.id,
                            debit: payAmount,
                            credit: 0,
                            description: 'تحصيل سداد سلفة صغيرة',
                        },
                        {

                            accountId: smallLoanAccount.id,
                            debit: 0,
                            credit: payAmount,
                            description: 'تخفيض مديونية سلفة صغيرة',
                        },
                    ],
                },
                currentUser,
            );

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUser);
            }

            const newPaid = Number((loan.paidAmount + payAmount).toFixed(2));
            const newRemaining = Number((loan.amount - newPaid).toFixed(2));

            const updatedLoan = await tx.smallLoan.update({
                where: { id },
                data: {
                    paidAmount: newPaid,
                    remaining: newRemaining,
                    status: newRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID',
                    closedAt: newRemaining === 0 ? new Date() : null,
                    notes: notes || loan.notes,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Small Loans',
                    action: 'POST',
                    description: `تم سداد ${payAmount} من سلفة ${loan.Name}`,
                },
            });

            return {
                message: 'تم تسجيل السداد بنجاح',
                loanId: id,
                paidNow: payAmount,
                totalPaid: updatedLoan.paidAmount,
                remaining: updatedLoan.remaining,
                journalId: journal.journal.id,
            };
        });
    }

    async delete(id: number, currentUser: number) {
        const loan = await this.prisma.smallLoan.findUnique({
            where: { id },
        });

        if (!loan)
            throw new NotFoundException('السلفة غير موجودة');

        if (loan.paidAmount > 0 && !loan.closedAt) {
            throw new BadRequestException(
                'لا يمكن حذف سلفة تم السداد عليها جزئياً',
            );
        }

        return this.prisma.$transaction(async (tx) => {
            if (!loan.closedAt && loan.paidAmount === 0) {
                const journals = await tx.journalHeader.findMany({
                    where: {
                        sourceType: 'SMALL_LOAN',
                        sourceId: loan.id,
                    },
                    select: { id: true, status: true },
                });

                for (const journal of journals) {
                    if (journal.status === 'POSTED') {
                        await this.journalService.unpostJournal(
                            currentUser,
                            journal.id,
                        );
                    }

                    await tx.journalLine.deleteMany({
                        where: { journalId: journal.id },
                    });

                    await tx.journalHeader.delete({
                        where: { id: journal.id },
                    });
                }
            }

            await tx.smallLoan.delete({
                where: { id },
            });

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Small Loans',
                    action: 'DELETE',
                    description: `تم حذف السلفة الصغيرة للمستفيد ${loan.Name}`,
                },
            });

            return {
                message: 'تم حذف السلفة بنجاح',
            };
        });
    }

    async update(id: number, body: any, currentUser: number) {
        const { Name, amount, notes } = body;

        const loan = await this.prisma.smallLoan.findUnique({
            where: { id },
        });

        if (!loan)
            throw new NotFoundException('السلفة غير موجودة');

        if (loan.paidAmount > 0)
            throw new BadRequestException(
                'لا يمكن تعديل سلفة تم السداد عليها',
            );

        if (amount !== undefined && amount <= 0)
            throw new BadRequestException('المبلغ غير صحيح');

        return this.prisma.$transaction(async (tx) => {

            const updatedLoan = await tx.smallLoan.update({
                where: { id },
                data: {
                    Name: Name ?? loan.Name,
                    amount: amount ?? loan.amount,
                    remaining: amount ?? loan.amount,
                    notes: notes ?? loan.notes,
                },
            });


            const journal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: JournalSourceType.SMALL_LOAN,
                    sourceId: loan.id,
                    reference: `SMALL-LOAN-${loan.id}`,
                },
                include: { lines: true },
            });

            if (!journal)
                throw new BadRequestException('قيد السلفة غير موجود');


            if (journal.status === 'POSTED') {
                await this.journalService.unpostJournal(
                    currentUser,
                    journal.id,
                );
            }


            await tx.journalLine.deleteMany({
                where: { journalId: journal.id },
            });

            const bank = await tx.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });

            const smallLoanAccount = await tx.account.findFirst({
                where: { accountBasicType: 'SMALL_LOANS_RECEIVABLE' },
            });

            if (!bank || !smallLoanAccount)
                throw new BadRequestException('الحسابات المحاسبية غير مكتملة');

            const finalAmount = amount ?? loan.amount;

            await tx.journalLine.createMany({
                data: [
                    {
                        journalId: journal.id,
                        accountId: smallLoanAccount.id,
                        debit: finalAmount,
                        credit: 0,
                        description: 'إثبات سلفة صغيرة',
                    },
                    {
                        journalId: journal.id,
                        accountId: bank.id,
                        debit: 0,
                        credit: finalAmount,
                        description: 'صرف نقدي سلفة صغيرة',
                    },
                ],
            });

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Small Loans',
                    action: 'UPDATE',
                    description: `تم تعديل السلفة الصغيرة للمستفيد ${updatedLoan.Name}`,
                },
            });

            return {
                message: 'تم تعديل السلفة بنجاح',
                loan: updatedLoan,
            };
        });
    }
}