import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import moment from 'moment-timezone';

@Injectable()
export class DashboardService {
    constructor(private readonly prisma: PrismaService) { }

    async getClientStats(filter?: 'daily' | 'monthly' | 'yearly') {
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        // Always use Saudi Time Zone
        const now = moment().tz("Asia/Riyadh");

        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            } else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            } else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            } else {
                throw new BadRequestException('Invalid filter');
            }
        }

        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        // Client count
        const count = await this.prisma.client.count({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        // Active clients
        const activeCount = await this.prisma.client.count({
            where: { status: 'نشط', ...(dateFilter && { createdAt: dateFilter }) },
        });

        // Overdue clients
        const overdueCount = await this.prisma.client.count({
            where: { status: 'متعثر', ...(dateFilter && { createdAt: dateFilter }) },
        });

        // New clients today (also using Saudi timezone)
        const todayStart = now.clone().startOf('day').toDate();
        const todayEnd = now.clone().endOf('day').toDate();

        const newClientsToday = await this.prisma.client.count({
            where: { createdAt: { gte: todayStart, lte: todayEnd } },
        });

        // Aggregations
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

    async getPartnerStats(filter?: 'daily' | 'monthly' | 'yearly') {
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        // Always use Saudi timezone
        const now = moment().tz("Asia/Riyadh");

        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            } else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            } else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            } else {
                throw new BadRequestException('Invalid filter');
            }
        }

        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        // Count partners
        const partnersCount = await this.prisma.partner.count({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        // Active and inactive partners
        const activePartners = await this.prisma.partner.count({
            where: { isActive: true, ...(dateFilter && { createdAt: dateFilter }) },
        });

        const inactivePartners = await this.prisma.partner.count({
            where: { isActive: false, ...(dateFilter && { createdAt: dateFilter }) },
        });

        // Sum capital & profit
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

    async getLoanAndBankStats(filter?: 'daily' | 'monthly' | 'yearly') {
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        // Saudi Time
        const now = moment().tz("Asia/Riyadh");

        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            } else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            } else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            } else {
                throw new BadRequestException('Invalid filter');
            }
        }

        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;

        // -------------------------
        // 🔹 LOANS STATISTICS
        // -------------------------

        // Total loans
        const loansCount = await this.prisma.loan.count({
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        // Group by status
        const loansByStatusRaw = await this.prisma.loan.groupBy({
            by: ['status'],
            _count: { status: true },
            where: dateFilter ? { createdAt: dateFilter } : undefined,
        });

        const loansByStatus = loansByStatusRaw.reduce((acc, row) => {
            acc[row.status] = row._count.status;
            return acc;
        }, {} as Record<string, number>);

        // Total loan amount
        const loanAmounts = await this.prisma.loan.aggregate({
            _sum: { amount: true },
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
                totalAmount: loanAmounts._sum.amount || 0,
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

        const startDate = now.clone().startOf('month').toDate();
        const endDate = now.clone().endOf('month').toDate();

        const dateFilter = { gte: startDate, lte: endDate };

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

        const paidAgg = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: { paymentDate: dateFilter },
        });

        const totalPaid = paidAgg._sum.paidAmount || 0;

        const totalRemaining = Math.max(totalRepayment - totalPaid, 0);

        // Calculate collection percentage
        const collectionPercentage = totalRepayment > 0 
            ? Math.round((totalPaid / totalRepayment) * 100) 
            : 0;

        // Get bank balance (available for lending)
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
        });

        const availableForLending = bankAccount?.balance || 0;

        return {
            range: { startDate, endDate },
            totalRepayment,
            totalPaid,
            totalRemaining,
            collectionPercentage,
            availableForLending,
        };
    }
}