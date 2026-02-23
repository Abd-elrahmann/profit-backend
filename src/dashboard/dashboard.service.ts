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

    private getTrendPeriods(filter?: string, from?: string, to?: string) {
        const now = moment().tz("Asia/Riyadh");
        let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;
        let trendLabel = 'منذ الفترة السابقة';

        if (from && to) {
            const start = moment(from, 'YYYY-MM-DD').tz("Asia/Riyadh").startOf('day');
            const end = moment(to, 'YYYY-MM-DD').tz("Asia/Riyadh").endOf('day');
            const duration = end.diff(start, 'days') + 1;
            
            currentStart = start.toDate();
            currentEnd = end.toDate();
            previousStart = start.clone().subtract(duration, 'days').toDate();
            previousEnd = start.clone().subtract(1, 'day').endOf('day').toDate();
            trendLabel = 'مقارنة بالفترة السابقة';
        } else if (filter === 'daily') {
            currentStart = now.clone().startOf('day').toDate();
            currentEnd = now.clone().endOf('day').toDate();
            previousStart = now.clone().subtract(1, 'day').startOf('day').toDate();
            previousEnd = now.clone().subtract(1, 'day').endOf('day').toDate();
            trendLabel = 'منذ أمس';
        } else if (filter === 'weekly') {
            currentStart = now.clone().startOf('week').toDate();
            currentEnd = now.clone().endOf('week').toDate();
            previousStart = now.clone().subtract(1, 'week').startOf('week').toDate();
            previousEnd = now.clone().subtract(1, 'week').endOf('week').toDate();
            trendLabel = 'منذ الأسبوع الماضي';
        } else if (filter === 'yearly') {
            currentStart = now.clone().startOf('year').toDate();
            currentEnd = now.clone().endOf('year').toDate();
            previousStart = now.clone().subtract(1, 'year').startOf('year').toDate();
            previousEnd = now.clone().subtract(1, 'year').endOf('year').toDate();
            trendLabel = 'منذ العام الماضي';
        } else {
            currentStart = now.clone().startOf('month').toDate();
            currentEnd = now.clone().endOf('month').toDate();
            previousStart = now.clone().subtract(1, 'month').startOf('month').toDate();
            previousEnd = now.clone().subtract(1, 'month').endOf('month').toDate();
            trendLabel = 'منذ الشهر الماضي';
        }

        return { currentStart, currentEnd, previousStart, previousEnd, trendLabel };
    }

    async getClientStats(filter?: string, from?: string, to?: string) {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        const now = moment().tz("Asia/Riyadh");
        const { currentStart, currentEnd, previousStart, previousEnd, trendLabel } = this.getTrendPeriods(filter, from, to);

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

        // Calculate client count trend based on filter
        const currentPeriodClients = await this.prisma.client.count({
            where: { createdAt: { gte: currentStart, lte: currentEnd } },
        });

        const previousPeriodClients = await this.prisma.client.count({
            where: { createdAt: { gte: previousStart, lte: previousEnd } },
        });

        let clientsTrend = 0;
        if (previousPeriodClients > 0) {
            clientsTrend = Number(((currentPeriodClients - previousPeriodClients) / previousPeriodClients * 100).toFixed(1));
        } else if (currentPeriodClients > 0) {
            clientsTrend = 100;
        }

        return {
            count,
            totalDebit: totalDebitResult || 0,
            totalPaid: totalPaidResult._sum.paidAmount || 0,
            remaining: remainingResult,
            activeCount,
            overdueCount,
            newClientsToday,
            clientsTrend,
            trendLabel,
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

        const { currentStart, currentEnd, previousStart, previousEnd, trendLabel } = this.getTrendPeriods(filter, from, to);

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

        // Calculate capital trend based on filter
        const currentPeriodCapital = await this.prisma.partner.aggregate({
            _sum: { capitalAmount: true },
            where: { createdAt: { gte: currentStart, lte: currentEnd } },
        });

        const previousPeriodCapital = await this.prisma.partner.aggregate({
            _sum: { capitalAmount: true },
            where: { createdAt: { gte: previousStart, lte: previousEnd } },
        });

        const currentCapital = currentPeriodCapital._sum.capitalAmount || 0;
        const previousCapital = previousPeriodCapital._sum.capitalAmount || 0;

        let capitalTrend = 0;
        if (previousCapital > 0) {
            capitalTrend = Number(((currentCapital - previousCapital) / previousCapital * 100).toFixed(1));
        } else if (currentCapital > 0) {
            capitalTrend = 100;
        }

        // Calculate profit trend based on filter
        const currentPeriodProfit = await this.prisma.partnerWithdrawal.aggregate({
            _sum: { monthlyAmount: true },
            where: { createdAt: { gte: currentStart, lte: currentEnd } },
        });

        const previousPeriodProfit = await this.prisma.partnerWithdrawal.aggregate({
            _sum: { monthlyAmount: true },
            where: { createdAt: { gte: previousStart, lte: previousEnd } },
        });

        const currentProfit = currentPeriodProfit._sum.monthlyAmount || 0;
        const previousProfit = previousPeriodProfit._sum.monthlyAmount || 0;

        let profitTrend = 0;
        if (previousProfit > 0) {
            profitTrend = Number(((currentProfit - previousProfit) / previousProfit * 100).toFixed(1));
        } else if (currentProfit > 0) {
            profitTrend = 100;
        }

        return {
            partnersCount,
            activePartners,
            inactivePartners,
            totalCapitalAmount: aggregated._sum.capitalAmount || 0,
            totalProfit: aggregated._sum.totalProfit || 0,
            capitalTrend,
            profitTrend,
            trendLabel,
            filter: filter || 'all',
            range: { startDate, endDate },
        };
    }

    async getLoanAndBankStats(filter?: string, from?: string, to?: string) {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        const { currentStart, currentEnd, previousStart, previousEnd, trendLabel } = this.getTrendPeriods(filter, from, to);

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

        // Calculate active loans trend based on filter
        const currentPeriodActiveLoans = await this.prisma.loan.count({
            where: { 
                status: 'ACTIVE',
                createdAt: { gte: currentStart, lte: currentEnd } 
            },
        });

        const previousPeriodActiveLoans = await this.prisma.loan.count({
            where: { 
                status: 'ACTIVE',
                createdAt: { gte: previousStart, lte: previousEnd } 
            },
        });

        let activeLoansTrend = 0;
        if (previousPeriodActiveLoans > 0) {
            activeLoansTrend = Number(((currentPeriodActiveLoans - previousPeriodActiveLoans) / previousPeriodActiveLoans * 100).toFixed(1));
        } else if (currentPeriodActiveLoans > 0) {
            activeLoansTrend = 100;
        }

        // Calculate total amount trend based on filter
        const currentPeriodAmounts = await this.prisma.loan.aggregate({
            _sum: { totalAmount: true, newAmount: true },
            where: { createdAt: { gte: currentStart, lte: currentEnd } },
        });

        const previousPeriodAmounts = await this.prisma.loan.aggregate({
            _sum: { totalAmount: true, newAmount: true },
            where: { createdAt: { gte: previousStart, lte: previousEnd } },
        });

        const currentPeriodTotal = currentPeriodAmounts._sum.newAmount || currentPeriodAmounts._sum.totalAmount || 0;
        const previousPeriodTotal = previousPeriodAmounts._sum.newAmount || previousPeriodAmounts._sum.totalAmount || 0;

        let totalAmountTrend = 0;
        if (previousPeriodTotal > 0) {
            totalAmountTrend = Number(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal * 100).toFixed(1));
        } else if (currentPeriodTotal > 0) {
            totalAmountTrend = 100;
        }

        return {
            loans: {
                count: loansCount,
                byStatus: loansByStatus,
                totalAmount:
                    loanAmounts._sum.newAmount
                        ? loanAmounts._sum.newAmount
                        : loanAmounts._sum.totalAmount || 0,
                activeLoansTrend,
                totalAmountTrend,
                trendLabel,
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
                        status: true,
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
            const loansCount = client.loans.length;
            const completedLoansCount = client.loans.filter((l) => l.status === 'COMPLETED').length;
            const loansPayments = client.loans.map((loan) => {
                const paidAmount = loan.repayments.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
                return {
                    paidCount: loan.repayments.filter((r) => (r.paidAmount || 0) > 0).length,
                    paymentsCount: loan.repayments.length,
                    paidAmount,
                };
            });

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
                loansCount,
                completedLoansCount,
                loansPayments,
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

    async getExpenseStats(filter?: string, from?: string, to?: string, period: 'first' | 'last' = 'first') {
        const { startDate, endDate } = this.parseDateRange(filter, from, to);
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        // إجمالي مصاريف الفترة
        const totalAgg = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });
        const totalExpenses = totalAgg._sum.amount || 0;

        // المصاريف المعلقة (قيد صحيفة DRAFT)
        const pendingExpenses = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: {
                journal: { status: 'DRAFT' },
                ...(dateFilter && { createdAt: dateFilter }),
            },
        });
        const pendingAmount = pendingExpenses._sum.amount || 0;

        // توزيع حسب النوع
        const byType = await this.prisma.expenseRecord.groupBy({
            by: ['type'],
            _sum: { amount: true },
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        const categoryBreakdown = byType.map((t) => ({
            type: t.type,
            amount: t._sum.amount || 0,
            percentage: totalExpenses > 0 ? Math.round(((t._sum.amount || 0) / totalExpenses) * 100) : 0,
        }));

        // أعلى فئة صرف
        const topCategory = categoryBreakdown.length > 0
            ? categoryBreakdown.reduce((a, b) => (a.amount > b.amount ? a : b))
            : null;

        // اتجاه المصاريف الشهرية (أول 6 أشهر أو آخر 6 أشهر من السنة)
        const now = moment().tz("Asia/Riyadh");
        const currentYear = now.year();
        const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const monthlyTrend: { month: string; amount: number }[] = [];
        const startMonth = period === 'first' ? 0 : 6;
        const endMonth = period === 'first' ? 5 : 11;
        for (let m = startMonth; m <= endMonth; m++) {
            const monthStart = moment.tz([currentYear, m, 1], 'Asia/Riyadh').startOf('month').toDate();
            const monthEnd = moment.tz([currentYear, m, 1], 'Asia/Riyadh').endOf('month').toDate();
            const agg = await this.prisma.expenseRecord.aggregate({
                _sum: { amount: true },
                where: { createdAt: { gte: monthStart, lte: monthEnd } },
            });
            monthlyTrend.push({
                month: monthNames[m],
                amount: agg._sum.amount || 0,
            });
        }

        // اتجاه النسبة المئوية (مقارنة بالفترة السابقة)
        const { currentStart, currentEnd, previousStart, previousEnd, trendLabel } = this.getTrendPeriods(filter, from, to);
        const currentPeriodAgg = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: currentStart, lte: currentEnd } },
        });
        const previousPeriodAgg = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: { createdAt: { gte: previousStart, lte: previousEnd } },
        });
        const currentTotal = currentPeriodAgg._sum.amount || 0;
        const previousTotal = previousPeriodAgg._sum.amount || 0;
        let totalTrend = 0;
        if (previousTotal > 0) {
            totalTrend = Number(((currentTotal - previousTotal) / previousTotal * 100).toFixed(1));
        } else if (currentTotal > 0) {
            totalTrend = 100;
        }

        let pendingTrend = 0;
        const currentPending = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: {
                journal: { status: 'DRAFT' },
                createdAt: { gte: currentStart, lte: currentEnd },
            },
        });
        const previousPending = await this.prisma.expenseRecord.aggregate({
            _sum: { amount: true },
            where: {
                journal: { status: 'DRAFT' },
                createdAt: { gte: previousStart, lte: previousEnd },
            },
        });
        const cp = currentPending._sum.amount || 0;
        const pp = previousPending._sum.amount || 0;
        if (pp > 0) {
            pendingTrend = Number(((cp - pp) / pp * 100).toFixed(1));
        } else if (cp > 0) {
            pendingTrend = 100;
        }

        // آخر المصاريف المسجلة
        const recentExpenses = await this.prisma.expenseRecord.findMany({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
            include: {
                user: { select: { name: true } },
                employee: { select: { name: true } },
                journal: { select: { status: true, reference: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
        });

        const recentMapped = recentExpenses.map((e) => ({
            id: e.id,
            journalId: e.journalId,
            reference: e.journal?.reference || `#EXP-${e.journalId}`,
            type: e.type,
            amount: e.amount,
            description: e.description,
            createdAt: e.createdAt,
            status: e.journal?.status === 'POSTED' ? 'مكتمل' : e.journal?.status === 'DRAFT' ? 'معلق' : 'قيد المعالجة',
            addedBy: e.user?.name,
        }));

        return {
            totalExpenses,
            totalTrend,
            pendingAmount,
            pendingTrend,
            topCategory: topCategory ? {
                type: topCategory.type,
                amount: topCategory.amount,
                percentage: topCategory.percentage,
            } : null,
            categoryBreakdown,
            monthlyTrend,
            recentExpenses: recentMapped,
            trendLabel,
            filter: filter || 'all',
            range: startDate && endDate ? { startDate, endDate } : undefined,
        };
    }
}