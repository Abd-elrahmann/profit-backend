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


    async withdrawProfit(amount: number, userId: number) {
        if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');


        const bank = await this.prisma.account.findUnique({ where: { code: "11000" } });
        if (!bank) throw new NotFoundException('لم يتم العثور على حساب البنك');


        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount) throw new NotFoundException('لم يتم العثور على حساب أرباح الشركة');


        if (companyProfitAccount.balance < amount)
            throw new BadRequestException('رصيد أرباح الشركة غير كافٍ لإجراء عملية السحب');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });


        const journal = await this.journalService.createJournal(
            {
                reference: `COMPANY-WITHDRAW-${DateTime.now().toFormat('yyyyLLdd-HHmm')}`,
                description: 'سحب أرباح الشركة',
                type: 'GENERAL',
                sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
                lines: [
                    {

                        accountId: bank.id,
                        debit: 0,
                        credit: amount,
                        description: 'سحب أرباح الشركة من حساب البنك',
                    },
                    {

                        accountId: companyProfitAccount.id,
                        debit: amount,
                        credit: 0,
                        description: 'إثبات سحب أرباح الشركة',
                    },
                ],
            },
            userId,
        );


        await this.journalService.postJournal(journal.journal.id, userId);


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


        const withdrawalWhere: any = { sourceType: 'COMPANY_PROFIT_WITHDRAWAL', status: 'POSTED' };
        if (filters?.search) {
            withdrawalWhere.OR = [
                { reference: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters?.startDate || filters?.endDate) {
            withdrawalWhere.date = {};
            if (filters.startDate) withdrawalWhere.date.gte = new Date(filters.startDate);
            if (filters.endDate) withdrawalWhere.date.lte = new Date(filters.endDate + "T23:59:59");
        }

        const totalWithdrawals = await this.prisma.journalHeader.count({ where: withdrawalWhere });
        const totalPages = Math.ceil(totalWithdrawals / limit);

        const withdrawals = await this.prisma.journalHeader.findMany({
            where: withdrawalWhere,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { lines: true },
        });

        const formattedWithdrawals = withdrawals.map(j => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: j.date.toISOString().split("T")[0],
            hijriDate: this.toHijri(j.date),
            amount: j.lines
                .filter(l => l.accountId === companyProfitAccount.id)
                .reduce((s, l) => s + Number(l.debit || 0), 0),
        }));

        const totalWithdrawnAmount = formattedWithdrawals.reduce((s, w) => s + w.amount, 0);


        const closingJournals = await this.prisma.journalHeader.findMany({
            where: { sourceType: 'PERIOD_CLOSING', status: 'POSTED' },
            include: { period: true, lines: { include: { account: true } } },
            orderBy: { date: 'asc' },
        });


        const pendingAccruals = await this.prisma.partnerShareAccrual.findMany({
            where: { isDistributed: false },
            include: { period: true },
            orderBy: { periodId: 'asc' },
        });

        let upcomingCompanyProfit = 0;
        let upcomingCents = 0;

        const accrualsByPeriod: Record<number, typeof pendingAccruals> = {};
        for (const a of pendingAccruals) {
            if (a.periodId === null) continue;
            if (!accrualsByPeriod[a.periodId]) accrualsByPeriod[a.periodId] = [];
            accrualsByPeriod[a.periodId].push(a);
        }

        for (const periodId in accrualsByPeriod) {
            const periodAccruals = accrualsByPeriod[periodId];

            let totalGrossPartner = 0;
            let totalGrossCompany = 0;
            let totalOldCents = 0;

            const partnerGrossMap = new Map<number, number>();
            for (const a of periodAccruals) {
                const pf = Number(a.partnerFinal || 0);
                const cc = Number(a.companyCut || 0);
                const cents = Number(a.cents || 0);

                totalGrossPartner += pf;
                totalGrossCompany += cc;
                totalOldCents += cents;

                partnerGrossMap.set(a.partnerId, pf);
            }

            const totalGross = totalGrossPartner + totalGrossCompany + totalOldCents;

            const expensesAgg = await this.prisma.journalLine.aggregate({
                where: { journal: { periodId: Number(periodId) }, account: { accountBasicType: 'EXPENSES' } },
                _sum: { debit: true },
            });
            const totalExpenses = Number(expensesAgg._sum.debit || 0);

            let centsFromPartners = 0;
            for (const [partnerId, gross] of partnerGrossMap.entries()) {
                const expenseShare = totalExpenses * (gross / totalGross);
                const netUnrounded = gross - expenseShare;
                const netRounded = Math.floor(netUnrounded);
                centsFromPartners += netUnrounded - netRounded;
                console.log(
                    `[PARTNER ${partnerId}] gross=${gross} expense=${expenseShare.toFixed(4)} net=${netUnrounded.toFixed(4)} rounded=${netRounded} cents=${centsFromPartners.toFixed(4)}`
                );
            }
            centsFromPartners = Number(centsFromPartners.toFixed(2));

            const companyExpenseShare = totalGross > 0
                ? totalExpenses * (totalGrossCompany / totalGross)
                : 0;
            const companyNet = totalGrossCompany - companyExpenseShare;

            const adjustedOldCents = totalGrossCompany > 0
                ? totalOldCents * (companyNet / totalGrossCompany)
                : 0;

            const totalCentsCollected = Number((centsFromPartners + adjustedOldCents).toFixed(2));

            upcomingCompanyProfit += Number(companyNet.toFixed(2));
            upcomingCents += totalCentsCollected;
        }

        const totalUpcoming = Number((upcomingCompanyProfit + upcomingCents).toFixed(2));


        const periods = [] as any;

        for (const journal of closingJournals) {
            const periodId = journal.period?.id;
            if (!periodId) continue;


            const totalPeriodProfit = journal.lines
                .filter(l => l.account.accountBasicType === 'LOAN_INCOME')
                .reduce((s, l) => s + Number(l.debit || 0), 0);


            const periodAccruals = await this.prisma.partnerShareAccrual.findMany({
                where: { periodId },
            });

            let totalGrossPartner = 0;
            let totalGrossCompany = 0;
            let totalOldCents = 0;

            const partnerMap = new Map<number, number>();

            for (const a of periodAccruals) {
                const pf = Number(a.partnerFinal || 0);
                const cc = Number(a.companyCut || 0);
                const cents = Number(a.cents || 0);

                totalGrossPartner += pf;
                totalGrossCompany += cc;
                totalOldCents += cents;

                partnerMap.set(a.partnerId, pf);
            }

            const totalGross = totalGrossPartner + totalGrossCompany + totalOldCents;


            const expensesAgg = await this.prisma.journalLine.aggregate({
                where: { journal: { periodId }, account: { accountBasicType: 'EXPENSES' } },
                _sum: { debit: true },
            });
            const totalExpenses = Number(expensesAgg._sum.debit || 0);


            let centsFromPartners = 0;
            for (const [partnerId, gross] of partnerMap.entries()) {
                const expenseShare = totalExpenses * (gross / totalGross);
                const netUnrounded = gross - expenseShare;
                const netRounded = Math.floor(netUnrounded);
                centsFromPartners += netUnrounded - netRounded;
            }
            centsFromPartners = Number(centsFromPartners.toFixed(2));


            const companyExpenseShare = totalGross > 0
                ? totalExpenses * (totalGrossCompany / totalGross)
                : 0;
            const companyNet = totalGrossCompany - companyExpenseShare;


            const adjustedOldCents = totalGrossCompany > 0
                ? totalOldCents * (companyNet / totalGrossCompany)
                : 0;

            const totalCents = Number((centsFromPartners + adjustedOldCents).toFixed(2));
            const companyProfit = Math.floor(companyNet);

            periods.push({
                periodId,
                periodName: journal.period?.name,
                date: journal.date.toISOString().split("T")[0],
                hijriDate: this.toHijri(journal.date),
                totalPeriodProfit: Number(totalPeriodProfit.toFixed(2)),
                companyProfit: Number(companyProfit.toFixed(2)),
                cents: totalCents,
                companyPercentage: totalPeriodProfit > 0
                    ? Number(((companyProfit / totalPeriodProfit) * 100).toFixed(2))
                    : 0,
                totalCompany: Number((companyProfit + totalCents).toFixed(2)),
            });
        }


        const totalCompanyProfitFromPeriods = periods.reduce((s, p) => s + p.companyProfit, 0);

        return {
            totalPages,
            currentPage: page,
            limit,

            availableAmount: Number(companyProfitAccount.balance.toFixed(2)),

            upcomingProfit: upcomingCompanyProfit,
            cents: upcomingCents,
            totalUpcoming,

            withdrawableProfit: {
                totalFromClosedPeriods: Number(totalCompanyProfitFromPeriods.toFixed(2)),
                withdrawn: Number(totalWithdrawnAmount.toFixed(2)),
                remaining: Number((totalCompanyProfitFromPeriods - totalWithdrawnAmount).toFixed(2)),
            },

            totalWithdrawals,
            data: formattedWithdrawals,

            periodsProfit: {
                totalCompanyProfit: Number(totalCompanyProfitFromPeriods.toFixed(2)),
                periodsCount: periods.length,
                periods,
            },
        };
    }
}