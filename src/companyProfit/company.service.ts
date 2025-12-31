import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DateTime } from 'luxon';
import moment from "moment-hijri";

@Injectable()
export class CompanyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    // Withdraw company profit
    async withdrawProfit(amount: number, userId: number) {
        if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');

        // Bank account (Cash in Bank)
        const bank = await this.prisma.account.findUnique({ where: { code: "11000" } });
        if (!bank) throw new NotFoundException('لم يتم العثور على حساب البنك');

        // Company Profit Account
        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount) throw new NotFoundException('لم يتم العثور على حساب أرباح الشركة');

        // Check available company profit
        if (companyProfitAccount.balance < amount)
            throw new BadRequestException('رصيد أرباح الشركة غير كافٍ لإجراء عملية السحب');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        // Create journal entry for profit withdrawal
        const journal = await this.journalService.createJournal(
            {
                reference: `COMPANY-WITHDRAW-${DateTime.now().toFormat('yyyyLLdd-HHmm')}`,
                description: 'سحب أرباح الشركة',
                type: 'GENERAL',
                sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
                lines: [
                    {
                        // البنك (Credit)
                        accountId: bank.id,
                        debit: 0,
                        credit: amount,
                        description: 'سحب أرباح الشركة من حساب البنك',
                    },
                    {
                        // أرباح الشركة (Debit)
                        accountId: companyProfitAccount.id,
                        debit: amount,
                        credit: 0,
                        description: 'إثبات سحب أرباح الشركة',
                    },
                ],
            },
            userId,
        );

        // Post the journal
        await this.journalService.postJournal(journal.journal.id, userId);

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Company Profit',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بسحب مبلغ (${amount}) من أرباح الشركة وتم تسجيل قيد محاسبي رقم (${journal.journal.id}).`,
            },
        });

        return { message: 'تم سحب الأرباح بنجاح' };
    }

    // Get company profit balance, withdrawals
    async getProfitReport(
        page: number,
        filters?: {
            limit?: number;
            search?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount)
            throw new NotFoundException('Company profit account not found');

        const where: any = {
            sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
            status: 'POSTED',
        };

        if (filters?.search) {
            where.OR = [
                { reference: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                where.date.gte = DateTime.fromISO(filters.startDate, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
            }
            if (filters.endDate) {
                where.date.lte = DateTime.fromISO(filters.endDate, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
            }
        }

        const totalWithdrawals = await this.prisma.journalHeader.count({ where });
        const totalPages = Math.ceil(totalWithdrawals / limit);

        const withdrawals = await this.prisma.journalHeader.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { lines: true },
        });

        const formattedWithdrawals = withdrawals.map((j) => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: DateTime.fromJSDate(j.date)
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd'),
            hijriDate: this.toHijri(j.date),
            amount: j.lines.reduce((sum, l) => sum + l.credit, 0),
        }));

        const closingJournals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: 'PERIOD_CLOSING',
                status: 'POSTED',
            },
            include: {
                period: true,
                lines: {
                    include: { account: true },
                },
            },
            orderBy: { date: 'asc' },
        });

        const periods = closingJournals.map((journal) => {
            const totalPeriodProfit = journal.lines
                .filter(l => l.account.accountBasicType === 'LOAN_INCOME')
                .reduce((sum, l) => sum + l.debit, 0);

            const companyProfit = journal.lines
                .filter(l => l.accountId === companyProfitAccount.id)
                .reduce((sum, l) => sum + l.credit, 0);

            const roundToTwo = (num) => Math.round(num * 100) / 100;

            const companyProfitPercentage = roundToTwo(companyProfit * 100 / totalPeriodProfit);

            return {
                periodId: journal.period?.id,
                periodName: journal.period?.name,
                date: DateTime.fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-MM-dd'),
                hijriDate: this.toHijri(journal.date),
                totalPeriodProfit,
                companyProfit,
                companyPercentage: companyProfitPercentage,
            };
        });

        const totalCompanyProfitFromPeriods = periods.reduce(
            (sum, p) => sum + p.companyProfit,
            0,
        );

        const upcomingCompanyProfitAgg =
            await this.prisma.partnerShareAccrual.aggregate({
                _sum: {
                    companyCut: true,
                },
                where: {
                    isClosed: false,
                    isDistributed: false,
                },
            });

        const upcomingCompanyProfit =
            Number(upcomingCompanyProfitAgg._sum.companyCut || 0);

        return {
            totalPages,
            currentPage: page,
            limit,
            availableAmount: companyProfitAccount.balance,
            upcomingProfit: upcomingCompanyProfit,
            totalWithdrawals,
            data: formattedWithdrawals,

            periodsProfit: {
                totalCompanyProfit: totalCompanyProfitFromPeriods,
                periodsCount: periods.length,
                periods,
            },
        };
    }
}