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
    // async getProfitReport(
    //     page: number,
    //     filters?: {
    //         limit?: number;
    //         search?: string;
    //         startDate?: string;
    //         endDate?: string;
    //     },
    // ) {
    //     const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
    //     const skip = (page - 1) * limit;

    //     const companyProfitAccount = await this.prisma.account.findFirst({
    //         where: { accountBasicType: 'COMPANY_SHARES' },
    //     });
    //     if (!companyProfitAccount)
    //         throw new NotFoundException('Company profit account not found');

    //     const withdrawalWhere: any = {
    //         sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
    //         status: 'POSTED',
    //     };
    //     if (filters?.search) {
    //         withdrawalWhere.OR = [
    //             { reference: { contains: filters.search, mode: 'insensitive' } },
    //             { description: { contains: filters.search, mode: 'insensitive' } },
    //         ];
    //     }
    //     if (filters?.startDate || filters?.endDate) {
    //         withdrawalWhere.date = {};
    //         if (filters.startDate) withdrawalWhere.date.gte = new Date(filters.startDate);
    //         if (filters.endDate) withdrawalWhere.date.lte = new Date(filters.endDate + "T23:59:59");
    //     }

    //     const totalWithdrawals = await this.prisma.journalHeader.count({ where: withdrawalWhere });
    //     const totalPages = Math.ceil(totalWithdrawals / limit);

    //     const withdrawals = await this.prisma.journalHeader.findMany({
    //         where: withdrawalWhere,
    //         skip,
    //         take: limit,
    //         orderBy: { date: 'desc' },
    //         include: { lines: true },
    //     });

    //     const formattedWithdrawals = withdrawals.map(j => ({
    //         id: j.id,
    //         reference: j.reference,
    //         description: j.description,
    //         date: j.date.toISOString().split("T")[0],
    //         hijriDate: this.toHijri(j.date),
    //         amount: j.lines
    //             .filter(l => l.accountId === companyProfitAccount.id)
    //             .reduce((s, l) => s + Number(l.debit || 0), 0),
    //     }));

    //     const totalWithdrawnAmount = formattedWithdrawals.reduce((s, w) => s + w.amount, 0);

    //     const closingJournals = await this.prisma.journalHeader.findMany({
    //         where: { sourceType: 'PERIOD_CLOSING', status: 'POSTED' },
    //         include: { period: true, lines: { include: { account: true } } },
    //         orderBy: { date: 'asc' },
    //     });

    //     const pendingAccruals = await this.prisma.partnerShareAccrual.findMany({
    //         where: { isDistributed: false },
    //         include: { period: true },
    //         orderBy: { periodId: 'asc' },
    //     });

    //     let upcomingCompanyProfit = 0;
    //     let upcomingCents = 0;

    //     const accrualsByPeriod: Record<number, typeof pendingAccruals> = {};
    //     for (const a of pendingAccruals) {
    //         if (a.periodId === null) continue;
    //         if (!accrualsByPeriod[a.periodId]) accrualsByPeriod[a.periodId] = [];
    //         accrualsByPeriod[a.periodId].push(a);
    //     }

    //     for (const periodId in accrualsByPeriod) {
    //         const periodAccruals = accrualsByPeriod[periodId];

    //         let totalGrossPartner = 0;
    //         let totalGrossCompany = 0;
    //         let totalOldCents = 0;

    //         const partnerGrossMap = new Map<number, number>();
    //         for (const a of periodAccruals) {
    //             const pf = Number(a.partnerFinal || 0);
    //             const cc = Number(a.companyCut || 0);
    //             const cents = Number(a.cents || 0);

    //             totalGrossPartner += pf;
    //             totalGrossCompany += cc;
    //             totalOldCents += cents;

    //             // Fill partner map to calculate rounding cents
    //             partnerGrossMap.set(a.partnerId, pf);
    //         }

    //         const totalGross = totalGrossPartner + totalGrossCompany + totalOldCents;

    //         const expensesAgg = await this.prisma.journalLine.aggregate({
    //             where: { journal: { periodId: Number(periodId) }, account: { accountBasicType: 'EXPENSES' } },
    //             _sum: { debit: true },
    //         });
    //         const totalExpenses = Number(expensesAgg._sum.debit || 0);

    //         let centsFromPartners = 0;
    //         for (const [partnerId, gross] of partnerGrossMap.entries()) {
    //             const expenseShare = totalExpenses * (gross / totalGross);
    //             const netUnrounded = gross - expenseShare;
    //             const netRounded = Math.floor(netUnrounded);
    //             const cents = netUnrounded - netRounded;
    //             centsFromPartners += cents;
    //         }
    //         centsFromPartners = Number(centsFromPartners.toFixed(2));

    //         const companyExpenseShare = totalGross > 0
    //             ? totalExpenses * (totalGrossCompany / totalGross)
    //             : 0;
    //         const companyNet = totalGrossCompany - companyExpenseShare;

    //         const adjustedOldCents = totalGrossCompany > 0
    //             ? totalOldCents * (companyNet / totalGrossCompany)
    //             : 0;

    //         const totalCentsCollected = Number((centsFromPartners + adjustedOldCents).toFixed(2));

    //         upcomingCompanyProfit += Number(companyNet.toFixed(2));
    //         upcomingCents += totalCentsCollected;
    //     }

    //     const totalUpcoming = Number((upcomingCompanyProfit + upcomingCents).toFixed(2));

    //     const periods = closingJournals.map(journal => {
    //         const totalPeriodProfit = journal.lines
    //             .filter(l => l.account.accountBasicType === 'LOAN_INCOME')
    //             .reduce((s, l) => s + Number(l.debit || 0), 0);

    //         const companyProfit = journal.lines
    //             .filter(l => l.accountId === companyProfitAccount.id)
    //             .reduce((s, l) => s + Number(l.credit || 0), 0);

    //         // Check if this period has pending accruals to get accurate profit/cents breakdown
    //         const periodAccruals = accrualsByPeriod[journal.periodId || 0];
    //         if (periodAccruals && periodAccruals.length > 0) {
    //             // Use the calculated values from accruals for accurate breakdown
    //             const periodProfit = upcomingCompanyProfit;
    //             const periodCents = upcomingCents;

    //             return {
    //                 periodId: journal.period?.id,
    //                 periodName: journal.period?.name,
    //                 date: journal.date.toISOString().split("T")[0],
    //                 hijriDate: this.toHijri(journal.date),
    //                 totalPeriodProfit: Number(totalPeriodProfit.toFixed(2)),
    //                 companyProfit: Number(periodProfit.toFixed(2)),
    //                 cents: Number(periodCents.toFixed(2)),
    //                 companyPercentage: totalPeriodProfit > 0
    //                     ? Number(((periodProfit / totalPeriodProfit) * 100).toFixed(2))
    //                     : 0,
    //             };
    //         }

    //         return {
    //             periodId: journal.period?.id,
    //             periodName: journal.period?.name,
    //             date: journal.date.toISOString().split("T")[0],
    //             hijriDate: this.toHijri(journal.date),
    //             totalPeriodProfit: Number(totalPeriodProfit.toFixed(2)),
    //             companyProfit: Number(companyProfit.toFixed(2)),
    //             companyPercentage: totalPeriodProfit > 0
    //                 ? Number(((companyProfit / totalPeriodProfit) * 100).toFixed(2))
    //                 : 0,
    //         };
    //     });

    //     const totalCompanyProfitFromPeriods = periods.reduce((s, p) => s + p.companyProfit, 0);

    //     return {
    //         totalPages,
    //         currentPage: page,
    //         limit,

    //         availableAmount: Number(companyProfitAccount.balance.toFixed(2)),

    //         upcomingProfit: upcomingCompanyProfit,
    //         cents: upcomingCents,
    //         totalUpcoming,

    //         withdrawableProfit: {
    //             totalFromClosedPeriods: Number(totalCompanyProfitFromPeriods.toFixed(2)),
    //             withdrawn: Number(totalWithdrawnAmount.toFixed(2)),
    //             remaining: Number((totalCompanyProfitFromPeriods - totalWithdrawnAmount).toFixed(2)),
    //         },

    //         totalWithdrawals,
    //         data: formattedWithdrawals,

    //         periodsProfit: {
    //             totalCompanyProfit: Number(totalCompanyProfitFromPeriods.toFixed(2)),
    //             periodsCount: periods.length,
    //             periods,
    //         },
    //     };
    // }

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

        // Withdrawals
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

        // Closed periods
        const closingJournals = await this.prisma.journalHeader.findMany({
            where: { sourceType: 'PERIOD_CLOSING', status: 'POSTED' },
            include: { period: true, lines: { include: { account: true } } },
            orderBy: { date: 'asc' },
        });

        // Pending accruals (for upcoming)
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

        // Calculate periods with company cents
        const periods = [] as any;

        for (const journal of closingJournals) {
            const periodId = journal.period?.id;
            if (!periodId) continue;

            // 1️⃣ Total period profit
            const totalPeriodProfit = journal.lines
                .filter(l => l.account.accountBasicType === 'LOAN_INCOME')
                .reduce((s, l) => s + Number(l.debit || 0), 0);

            // 2️⃣ Get all accruals for this period
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

            // 3️⃣ Expenses for this period
            const expensesAgg = await this.prisma.journalLine.aggregate({
                where: { journal: { periodId }, account: { accountBasicType: 'EXPENSES' } },
                _sum: { debit: true },
            });
            const totalExpenses = Number(expensesAgg._sum.debit || 0);

            // 4️⃣ Partner cents calculation
            let centsFromPartners = 0;
            for (const [partnerId, gross] of partnerMap.entries()) {
                const expenseShare = totalExpenses * (gross / totalGross);
                const netUnrounded = gross - expenseShare;
                const netRounded = Math.floor(netUnrounded);
                centsFromPartners += netUnrounded - netRounded;
            }
            centsFromPartners = Number(centsFromPartners.toFixed(2));

            // 5️⃣ Company net after expenses
            const companyExpenseShare = totalGross > 0
                ? totalExpenses * (totalGrossCompany / totalGross)
                : 0;
            const companyNet = totalGrossCompany - companyExpenseShare;

            // 6️⃣ Adjust old cents proportionally
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