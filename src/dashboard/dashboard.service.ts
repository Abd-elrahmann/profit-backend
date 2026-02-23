import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import moment from 'moment-timezone';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    private parseDateRange(
        filter?: string,
        from?: string,
        to?: string,
    ): { startDate?: Date; endDate?: Date } {
        const now = moment().tz("Asia/Riyadh");
        if (from && to) {
            const start = moment(from, 'YYYY-MM-DD').tz("Asia/Riyadh").startOf('day').toDate();
            const end = moment(to, 'YYYY-MM-DD').tz("Asia/Riyadh").endOf('day').toDate();
            if (start > end) throw new BadRequestException('Invalid date range: from must be before to');
            return { startDate: start, endDate: end };
        }
        if (!filter || filter === 'all') return {};
        if (filter === 'daily') {
            return {
                startDate: now.clone().startOf('day').toDate(),
                endDate: now.clone().endOf('day').toDate(),
            };
        }
        if (filter === 'weekly') {
            return {
                startDate: now.clone().startOf('week').toDate(),
                endDate: now.clone().endOf('week').toDate(),
            };
        }
        if (filter === 'monthly') {
            return {
                startDate: now.clone().startOf('month').toDate(),
                endDate: now.clone().endOf('month').toDate(),
            };
        }
        if (filter === 'yearly') {
            return {
                startDate: now.clone().startOf('year').toDate(),
                endDate: now.clone().endOf('year').toDate(),
            };
        }
        throw new BadRequestException('Invalid filter');
    }

    async getClientStats(filter?: string, from?: string, to?: string) {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        const now = moment().tz("Asia/Riyadh");


        const count = await this.prisma.client.count({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });


        const activeCount = await this.prisma.client.count({
            where: { status: 'نشط', ...(dateFilter && { createdAt: dateFilter }) },
        });


        const overdueCount = await this.prisma.client.count({
            where: { status: 'متعثر', ...(dateFilter && { createdAt: dateFilter }) },
        });


        const todayStart = now.clone().startOf('day').toDate();
        const todayEnd = now.clone().endOf('day').toDate();

        const newClientsToday = await this.prisma.client.count({
            where: { createdAt: { gte: todayStart, lte: todayEnd } },
        });


        const totalDebit = await this.prisma.repayment.aggregate({
            _sum: { principalAmount: true, interestAmount: true },
            where: dateFilter
                ? {
                    OR: [
                        { newDueDate: dateFilter },
                        { dueDate: dateFilter },
                    ],
                }
                : undefined,
        });

        const totalDebitResult = totalDebit._sum.principalAmount! + totalDebit._sum.interestAmount!;

        const totalPaidResult = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: dateFilter ? { paymentDate: dateFilter } : undefined,
        });

        const remainingResult = Math.max((totalDebitResult || 0) - (totalPaidResult._sum.paidAmount || 0), 0);

        return {
            count,
            totalDebit: totalDebitResult || 0,
            totalPaid: totalPaidResult._sum.paidAmount || 0,
            remaining: remainingResult,
            activeCount,
            overdueCount,
            newClientsToday,
            filter: filter || 'all',
            range: { startDate, endDate },
        };
    }

    async getClientRegistrationGrowth(months: number = 6, period: 'first' | 'last' = 'first') {
        const now = moment().tz('Asia/Riyadh');
        const currentYear = now.year();
        const monthNames = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];
        const result: { month: string; count: number }[] = [];

        const startMonth = period === 'first' ? 0 : 6;
        const endMonth = period === 'first' ? 5 : 11;

        for (let m = startMonth; m <= endMonth; m++) {
            const start = moment.tz([currentYear, m, 1], 'Asia/Riyadh').startOf('month').toDate();
            const end = moment.tz([currentYear, m, 1], 'Asia/Riyadh').endOf('month').toDate();

            const count = await this.prisma.client.count({
                where: { createdAt: { gte: start, lte: end } },
            });

            result.push({
                month: monthNames[m],
                count,
            });
        }
        return result;
    }

    async getPartnerStats(filter?: string, from?: string, to?: string) {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;


        const partnersCount = await this.prisma.partner.count({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });


        const activePartners = await this.prisma.partner.count({
            where: { isActive: true, ...(dateFilter && { createdAt: dateFilter }) },
        });

        const inactivePartners = await this.prisma.partner.count({
            where: { isActive: false, ...(dateFilter && { createdAt: dateFilter }) },
        });


        const aggregated = await this.prisma.partner.aggregate({
            _sum: {
                capitalAmount: true,
                totalProfit: true,
            },
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        return {
            partnersCount,
            activePartners,
            inactivePartners,
            totalCapitalAmount: aggregated._sum.capitalAmount || 0,
            totalProfit: aggregated._sum.totalProfit || 0,
            filter: filter || 'all',
            range: { startDate, endDate },
        };
    }

    async getLoanAndBankStats(filter?: string, from?: string, to?: string) {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;


        const loans = await this.prisma.loan.findMany({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
            include: {
                repayments: {
                    select: { dueDate: true, paymentDate: true, status: true }
                }
            }
        });


        function computeLoanStatus(loan) {

            if (loan.status === "COMPLETED") {
                return "COMPLETED";
            }


            if (loan.status === "ACTIVE") {
                const overdue = loan.repayments.some(r => r.status === "OVERDUE");

                if (overdue) return "OVERDUE";
            }


            return loan.status;
        }


        const loansByStatus: Record<string, number> = {};
        loans.forEach(loan => {
            const finalStatus = computeLoanStatus(loan);
            loansByStatus[finalStatus] = (loansByStatus[finalStatus] || 0) + 1;
        });


        const loansCount = loans.length;


        const loanAmounts = await this.prisma.loan.aggregate({
            _sum: { totalAmount: true, newAmount: true },
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });


        const bankAccounts = await this.prisma.account.findUnique({
            where: { code: "11000" },
        });

        const bankBalance = bankAccounts?.balance || 0;

        return {
            loans: {
                count: loansCount,
                byStatus: loansByStatus,
                totalAmount:
                    loanAmounts._sum.newAmount
                        ? loanAmounts._sum.newAmount
                        : loanAmounts._sum.totalAmount || 0,
            },
            bank: {
                balance: bankBalance,
            },
            filter: filter || 'all',
            range: { startDate, endDate },
        };
    }

    async getMonthlyCollection() {
        const now = moment().tz("Asia/Riyadh");
        console.log('Current date (Asia/Riyadh):', now.format('YYYY-MM-DD HH:mm:ss'));

        const startDate = now.clone().startOf('month').toDate();
        const endDate = now.clone().endOf('month').toDate();
        console.log('Month range:', startDate, 'to', endDate);
        console.log('Month name:', now.format('MMMM'), 'Year:', now.year());

        // Use the actual month/year from moment for the response
        const currentMonth = now.month(); // 0-indexed
        const currentYear = now.year();

        // Last month dates for comparison
        const lastMonthStart = now.clone().subtract(1, 'month').startOf('month').toDate();
        const lastMonthEnd = now.clone().subtract(1, 'month').endOf('month').toDate();

        const dateFilter = { gte: startDate, lte: endDate };
        const lastMonthFilter = { gte: lastMonthStart, lte: lastMonthEnd };

        const dueAgg = await this.prisma.repayment.aggregate({
            _sum: {
                principalAmount: true,
                interestAmount: true,
            },
            where: {
                OR: [
                    { newDueDate: dateFilter },
                    { dueDate: dateFilter },
                ],
            },
        });

        const totalRepayment =
            (dueAgg._sum.principalAmount || 0) +
            (dueAgg._sum.interestAmount || 0);

        const currentMonthpaid = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: {
                OR: [
                    { newDueDate: dateFilter },
                    { dueDate: dateFilter },
                ],
            },
        });

        const paidAgg = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: { paymentDate: dateFilter },
        });

        const totalPaid = paidAgg._sum.paidAmount || 0;
        const totalRemaining = Math.max(totalRepayment - totalPaid, 0);

        let collectionPercentage = totalRepayment > 0
            ? Math.round((totalPaid / totalRepayment) * 100)
            : 0;

        if (totalPaid >= totalRepayment) {
            collectionPercentage = 100;
        }

        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
            select: {
                id: true,
                name: true,
                code: true,
                debit: true,
                credit: true,
                balance: true,
            },
        });

        const loansAccount = await this.prisma.account.findUnique({
            where: { code: "12000" },
            select: { balance: true },
        });

        const monthRepayments = await this.prisma.repayment.findMany({
            select: { amount: true, paidAmount: true },
        });

        const totalAmount = monthRepayments.reduce(
            (sum, r) => sum + Number(r.amount),
            0
        );

        const paidUntilNow = monthRepayments.reduce(
            (sum, r) => sum + Number(r.paidAmount),
            0
        );

        const remaining = totalAmount - paidUntilNow;

        const currentpaid = currentMonthpaid._sum.paidAmount || 0

        let collectionPercentages = totalRepayment > 0
            ? Math.round((currentpaid / totalRepayment) * 100)
            : 0;

        if (currentpaid >= totalRepayment) {
            collectionPercentage = 100;
        }

        // Calculate last month's collection percentage for comparison
        const lastMonthDueAgg = await this.prisma.repayment.aggregate({
            _sum: { principalAmount: true, interestAmount: true },
            where: {
                OR: [
                    { newDueDate: lastMonthFilter },
                    { dueDate: lastMonthFilter },
                ],
            },
        });
        const lastMonthTotalDue = (lastMonthDueAgg._sum.principalAmount || 0) + (lastMonthDueAgg._sum.interestAmount || 0);

        const lastMonthPaidAgg = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: {
                OR: [
                    { newDueDate: lastMonthFilter },
                    { dueDate: lastMonthFilter },
                ],
            },
        });
        const lastMonthPaid = lastMonthPaidAgg._sum.paidAmount || 0;
        const lastMonthPercentage = lastMonthTotalDue > 0 ? Math.round((lastMonthPaid / lastMonthTotalDue) * 100) : 0;
        
        const changeFromLastMonth = collectionPercentages - lastMonthPercentage;

        return {
            range: { startDate, endDate },
            month: currentMonth,
            year: currentYear,

            totalRepayment,
            totalPaid,
            totalRemaining,
            collectionPercentage,
            bankAccount,
            loansBalance: loansAccount?.balance || 0,
            total: (bankAccount?.balance || 0) + (loansAccount?.balance || 0),
            repaymentsSummary: {
                totalAmount,
                paidUntilNow,
                remaining,
            },
            currentMonth: {
                totalAmount: totalRepayment,
                paidUntilNow: currentMonthpaid._sum.paidAmount || 0,
                remaining: Math.max(totalRepayment - (currentMonthpaid._sum.paidAmount || 0), 0),
                collectionPercentage: collectionPercentages,
            },
            changeFromLastMonth,
        };
    }

    async getDailyCollectionTrend(days: number = 7) {
        const now = moment().tz('Asia/Riyadh');
        const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const result: { day: string; collected: number; expected: number }[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const d = now.clone().subtract(i, 'days');
            const start = d.clone().startOf('day').toDate();
            const end = d.clone().endOf('day').toDate();
            const range = { gte: start, lte: end };

            const paidAgg = await this.prisma.repayment.aggregate({
                _sum: { paidAmount: true },
                where: { paymentDate: range },
            });
            const collected = paidAgg._sum.paidAmount || 0;

            const dueAgg = await this.prisma.repayment.aggregate({
                _sum: { principalAmount: true, interestAmount: true },
                where: {
                    OR: [
                        { newDueDate: range },
                        { dueDate: range },
                    ],
                },
            });
            const expected =
                (dueAgg._sum.principalAmount || 0) + (dueAgg._sum.interestAmount || 0);

            result.push({
                day: dayNames[d.day()],
                collected,
                expected,
            });
        }
        return result;
    }

    async getPendingReviewRepayments(limit: number = 10) {
        const now = moment().tz('Asia/Riyadh').toDate();
        const items = await this.prisma.repayment.findMany({
            where: {
                OR: [
                    { status: 'PENDING_REVIEW' },
                    {
                        status: 'PENDING',
                        OR: [
                            { newDueDate: { lte: now } },
                            { dueDate: { lte: now } },
                        ],
                    },
                ],
            },
            orderBy: { dueDate: 'desc' },
            take: limit,
            include: {
                loan: { select: { id: true, client: { select: { name: true } } } },
            },
        });

        return items.map((r) => ({
            id: r.id,
            loanId: r.loanId,
            clientName: r.loan?.client?.name,
            reference: `REP-${String(r.id).padStart(8, '0')}`,
            amount: (r.principalAmount || 0) + (r.interestAmount || 0),
            dueDate: r.newDueDate || r.dueDate,
            status: 'بانتظار المراجعة',
            initials: r.loan?.client?.name
                ?.split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join(' ') || '—',
        }));
    }

    async getUpcomingRepayments(limit: number = 20, days: number = 7) {
        const now = moment().tz("Asia/Riyadh").toDate();
        const endDate = moment().tz("Asia/Riyadh").add(days, 'days').endOf('day').toDate();

        const raw = await this.prisma.repayment.findMany({
            where: {
                status: "PENDING",
                OR: [
                    { newDueDate: { gte: now } },
                    { dueDate: { gte: now } },
                ],
            },
            orderBy: [{ newDueDate: 'asc' }, { dueDate: 'asc' }],
            take: limit * 2,
            include: {
                loan: {
                    select: {
                        id: true,
                        source: true,
                        client: { select: { name: true } },
                    },
                },
            },
        });

        const sourceLabel = (s: string) => {
            const map: Record<string, string> = {
                GENERAL: 'عام',
                NEW_CAPITAL: 'رأس مال جديد',
                MIX: 'مزيج',
            };
            return map[s] || s;
        };

        const statusLabel = (status: string) =>
            status === 'PENDING_REVIEW' ? 'قيد المراجعة' : 'مجدول';

        const inRange: typeof raw = [];
        for (const r of raw) {
            const due = r.newDueDate || r.dueDate;
            if (due && due >= now && due <= endDate) {
                inRange.push(r);
                if (inRange.length >= limit) break;
            }
        }

        const items = inRange.map((r) => {
            const due = r.newDueDate || r.dueDate;
            const amount = (r.principalAmount || 0) + (r.interestAmount || 0);
            return {
                id: r.id,
                loanId: r.loanId,
                clientName: r.loan?.client?.name,
                source: sourceLabel(r.loan?.source || 'GENERAL'),
                dueDate: due,
                amount,
                status: statusLabel(r.status),
                initials: r.loan?.client?.name
                    ?.split(' ')
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join(' ') || '—',
            };
        });

        const totalExpected = items.reduce((s, i) => s + i.amount, 0);

        return { repayments: items, totalExpected };
    }

    async getLastActions(limit: number = 10, screenFilter?: string) {
        const screensToShow = ["Distribution", "Loans", "Journals", "Partners", "Repayments"];

        const where: { screen?: { in: string[] } | string } = {};
        if (screenFilter && screenFilter !== 'all') {
            const screenMap: Record<string, string> = {
                loans: 'Loans',
                payments: 'Repayments',
                journals: 'Journals',
                partners: 'Partners',
                distribution: 'Distribution',
            };
            const screen = screenMap[screenFilter];
            if (screen) where.screen = screen;
        } else {
            where.screen = { in: screensToShow };
        }

        return await this.prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: {
                    select: { name: true },
                },
            },
        });
    }

    async getLastActionsStats() {
        const now = moment().tz('Asia/Riyadh');
        const todayStart = now.clone().startOf('day').toDate();
        const todayEnd = now.clone().endOf('day').toDate();

        const todayLogs = await this.prisma.auditLog.findMany({
            where: { createdAt: { gte: todayStart, lte: todayEnd } },
            select: { userId: true },
        });

        const uniqueUsers = new Set(todayLogs.map((l) => l.userId)).size;

        return {
            todayCount: todayLogs.length,
            activeUsersToday: uniqueUsers,
        };
    }

    async getLatestClients(limit: number = 5) {
        const clients = await this.prisma.client.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                loans: {
                    select: {
                        totalAmount: true,
                        newAmount: true,
                        repayments: {
                            select: {
                                principalAmount: true,
                                interestAmount: true,
                                paidAmount: true,
                            },
                        },
                    },
                },
            },
        });

        return clients.map((client) => {
            const totalLoans = client.loans.reduce(
                (sum, l) => sum + (Number(l.newAmount) || l.totalAmount || 0),
                0,
            );
            let totalDue = 0;
            let totalPaid = 0;
            client.loans.forEach((loan) => {
                loan.repayments.forEach((r) => {
                    totalDue += (r.principalAmount || 0) + (r.interestAmount || 0);
                    totalPaid += r.paidAmount || 0;
                });
            });
            const commitmentPercent = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;

            const initials = client.name
                .split(' ')
                .slice(0, 2)
                .map((w) => w[0])
                .join(' ');

            return {
                id: client.id,
                name: client.name,
                createdAt: client.createdAt,
                totalLoans,
                commitment: Math.min(commitmentPercent, 100),
                status: client.status,
                initials,
                totalPaid,
                paymentsCount: client.loans.reduce((sum, l) => sum + l.repayments.length, 0),
            };
        });
    }

    async getTopCommittedClients(limit: number = 5) {
        const clients = await this.prisma.client.findMany({
            include: {
                loans: {
                    select: {
                        totalAmount: true,
                        newAmount: true,
                        repayments: {
                            select: {
                                principalAmount: true,
                                interestAmount: true,
                                paidAmount: true,
                            },
                        },
                    },
                },
            },
        });

        const withCommitment = clients.map((client) => {
            let totalDue = 0;
            let totalPaid = 0;
            let paymentsCount = 0;
            client.loans.forEach((loan) => {
                loan.repayments.forEach((r) => {
                    totalDue += (r.principalAmount || 0) + (r.interestAmount || 0);
                    totalPaid += r.paidAmount || 0;
                    paymentsCount += 1;
                });
            });
            const commitment = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 100;
            const paidCount = client.loans.reduce(
                (sum, l) => sum + l.repayments.filter((r) => (r.paidAmount || 0) > 0).length,
                0,
            );

            return {
                id: client.id,
                name: client.name,
                nationalId: client.nationalId,
                commitment: Math.min(commitment, 100),
                totalPaid,
                paymentsCount,
                paidCount,
                totalDue,
                status: client.status,
            };
        });

        return withCommitment
            .filter((c) => c.totalDue > 0)
            .sort((a, b) => b.commitment - a.commitment)
            .slice(0, limit);
    }

    async getLatestLoans(limit: number = 5) {
        const loans = await this.prisma.loan.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                client: { select: { name: true } },
                repayments: { select: { status: true } },
            },
        });

        const computeStatus = (loan) => {
            if (loan.status === 'COMPLETED') return 'مكتمل';
            if (loan.status === 'PENDING') return 'معلق';
            if (loan.status === 'DEFAULTED') return 'متعثر';
            const hasOverdue = loan.repayments?.some((r) => r.status === 'OVERDUE');
            return hasOverdue ? 'متأخر' : 'نشط';
        };

        const sourceLabel = (s) => {
            const map = { GENERAL: 'عام', NEW_CAPITAL: 'رأس مال جديد', MIX: 'مزيج' };
            return map[s] || s;
        };

        return loans.map((l) => ({
            id: l.id,
            clientName: l.client?.name,
            source: sourceLabel(l.source),
            amount: l.newAmount || l.totalAmount,
            startDate: l.startDate,
            status: computeStatus(l),
        }));
    }

    async getLoanDistributionBySource() {
        const loans = await this.prisma.loan.findMany({
            where: { status: { in: ['ACTIVE', 'COMPLETED'] } },
            select: { source: true, newAmount: true, totalAmount: true },
        });

        const total = loans.reduce(
            (s, l) => s + (Number(l.newAmount) || l.totalAmount || 0),
            0,
        ) || 1;

        const bySource = { GENERAL: 0, NEW_CAPITAL: 0, MIX: 0 };
        loans.forEach((l) => {
            const amt = Number(l.newAmount) || l.totalAmount || 0;
            bySource[l.source] = (bySource[l.source] || 0) + amt;
        });

        const labels = { GENERAL: 'عام', NEW_CAPITAL: 'رأس مال جديد', MIX: 'مزيج' };
        return Object.entries(bySource).map(([source, amount]) => ({
            label: labels[source],
            amount,
            percent: Math.round((amount / total) * 100),
        }));
    }

    async getMonthlyRepaymentTrend(months: number = 6, period: 'first' | 'last' = 'first') {
        const now = moment().tz('Asia/Riyadh');
        const currentYear = now.year();
        const monthNames = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];

        const result: { month: string; value: number }[] = [];
        
        // Determine the start and end months based on period
        const startMonth = period === 'first' ? 0 : 6; // 0 for Jan, 6 for Jul
        const endMonth = period === 'first' ? 5 : 11; // 5 for Jun, 11 for Dec
        
        for (let m = startMonth; m <= endMonth; m++) {
            const monthMoment = moment.tz([currentYear, m, 1], 'Asia/Riyadh');
            const start = monthMoment.clone().startOf('month').toDate();
            const end = monthMoment.clone().endOf('month').toDate();
            const range = { gte: start, lte: end };

            // Get all repayments that are due in this month
            const dueAgg = await this.prisma.repayment.aggregate({
                _sum: { principalAmount: true, interestAmount: true },
                where: {
                    OR: [
                        { newDueDate: range },
                        { dueDate: range },
                    ],
                },
            });
            const totalDue =
                (dueAgg._sum.principalAmount || 0) + (dueAgg._sum.interestAmount || 0);

            // Get paid amount for repayments that were DUE in this month (regardless of when they were paid)
            const paidAgg = await this.prisma.repayment.aggregate({
                _sum: { paidAmount: true },
                where: {
                    OR: [
                        { newDueDate: range },
                        { dueDate: range },
                    ],
                    status: { in: ['PAID', 'COMPLETED'] }, // Only count actually paid repayments
                },
            });
            const totalPaid = paidAgg._sum.paidAmount || 0;

            const pct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
            
            console.log(`[Repayment Trend] ${monthNames[m]} ${currentYear}: Due=${totalDue}, Paid=${totalPaid}, Percentage=${pct}%`);
            
            result.push({
                month: monthNames[m],
                value: Math.min(pct, 100),
            });
        }
        
        return result;
    }

    async getPartnerDetailsForDashboard(limit: number = 10) {
        const totalCapital = await this.prisma.partner.aggregate({
            _sum: { totalAmount: true },
            where: { isNewPartner: false, joinDistribute: true, isFrozen: false },
        });

        const total = totalCapital._sum.totalAmount || 1;

        const partners = await this.prisma.partner.findMany({
            where: { isNewPartner: false },
            take: limit,
            orderBy: { totalAmount: 'desc' },
            include: {
                AccountPayable: { select: { balance: true } },
                PartnerWithdrawal: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { monthlyAmount: true, createdAt: true },
                },
            },
        });

        return partners.map((p) => {
            const sharePercent = total > 0 && p.joinDistribute && !p.isFrozen
                ? Number(((p.totalAmount / total) * 100).toFixed(0))
                : 0;
            const lastWithdrawal = p.PartnerWithdrawal?.[0];
            const statusLabel = p.isFrozen ? 'قيد المراجعة' : p.isActive ? 'نشط' : 'غير نشط';

            return {
                id: p.id,
                name: p.name,
                isNewPartner: p.isNewPartner,
                sharePercent,
                balance: p.totalAmount,
                lastProfitAmount: lastWithdrawal?.monthlyAmount ?? p.totalProfit,
                lastProfitDate: lastWithdrawal?.createdAt ?? null,
                status: statusLabel,
                initials: p.name.split(' ').slice(0, 2).map((w) => w[0]).join(' '),
            };
        });
    }

    async getPartnerProfitGrowth(months: number = 6, period: 'first' | 'last' = 'first') {
        const now = moment().tz('Asia/Riyadh');
        const currentYear = now.year();
        const monthNames = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
        ];
        const result: { month: string; totalProfit: number }[] = [];

        const startMonth = period === 'first' ? 0 : 6;
        const endMonth = period === 'first' ? 5 : 11;

        for (let m = startMonth; m <= endMonth; m++) {
            const start = moment.tz([currentYear, m, 1], 'Asia/Riyadh').startOf('month').toDate();
            const end = moment.tz([currentYear, m, 1], 'Asia/Riyadh').endOf('month').toDate();

            const withdrawals = await this.prisma.partnerWithdrawal.aggregate({
                _sum: { monthlyAmount: true },
                where: { createdAt: { gte: start, lte: end } },
            });

            result.push({
                month: monthNames[m],
                totalProfit: withdrawals._sum.monthlyAmount || 0,
            });
        }
        return result;
    }

    async getRepaymentsByMonth(year: number, month: number) {
        const startDate = moment.tz([year, month - 1, 1], 'Asia/Riyadh').startOf('month').toDate();
        const endDate = moment.tz([year, month - 1, 1], 'Asia/Riyadh').endOf('month').toDate();
        const dateFilter = { gte: startDate, lte: endDate };

        const repayments = await this.prisma.repayment.findMany({
            where: {
                OR: [
                    { newDueDate: dateFilter },
                    { dueDate: dateFilter },
                ],
            },
            include: {
                loan: {
                    include: {
                        client: { select: { name: true } },
                    },
                },
            },
            orderBy: [
                { newDueDate: 'asc' },
                { dueDate: 'asc' },
            ],
        });

        const totalExpected = repayments.reduce(
            (sum, r) => sum + Number(r.principalAmount || 0) + Number(r.interestAmount || 0),
            0
        );

        const totalPaid = repayments.reduce(
            (sum, r) => sum + Number(r.paidAmount || 0),
            0
        );

        const totalRemaining = totalExpected - totalPaid;

        const sourceLabel = (s: string) => {
            const map: Record<string, string> = {
                GENERAL: 'عام',
                NEW_CAPITAL: 'رأس مال جديد',
                MIX: 'مزيج',
            };
            return map[s] || s;
        };

        const mappedRepayments = repayments.map((r) => ({
            id: r.id,
            loanId: r.loanId,
            clientName: r.loan?.client?.name || '—',
            source: sourceLabel(r.loan?.source || 'GENERAL'),
            dueDate: r.newDueDate || r.dueDate,
            amount: Number(r.principalAmount || 0) + Number(r.interestAmount || 0),
            paidAmount: Number(r.paidAmount || 0),
            status: r.status === 'PAID' ? 'مدفوع' : r.status === 'PENDING' ? 'معلق' : 'قيد المراجعة',
        }));

        return {
            repayments: mappedRepayments,
            totalExpected,
            totalPaid,
            totalRemaining,
            month: month,
            year: year,
        };
    }
}