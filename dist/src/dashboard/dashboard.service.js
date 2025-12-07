"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
let DashboardService = class DashboardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getClientStats(filter) {
        let startDate;
        let endDate;
        const now = (0, moment_timezone_1.default)().tz("Asia/Riyadh");
        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            }
            else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            }
            else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            }
            else {
                throw new common_1.BadRequestException('Invalid filter');
            }
        }
        const dateFilter = startDate && endDate ? { gte: startDate, lte: endDate } : undefined;
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
        const totalDebitResult = totalDebit._sum.principalAmount + totalDebit._sum.interestAmount;
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
    async getPartnerStats(filter) {
        let startDate;
        let endDate;
        const now = (0, moment_timezone_1.default)().tz("Asia/Riyadh");
        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            }
            else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            }
            else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            }
            else {
                throw new common_1.BadRequestException('Invalid filter');
            }
        }
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
    async getLoanAndBankStats(filter) {
        let startDate;
        let endDate;
        const now = (0, moment_timezone_1.default)().tz("Asia/Riyadh");
        if (filter) {
            if (filter === 'daily') {
                startDate = now.clone().startOf('day').toDate();
                endDate = now.clone().endOf('day').toDate();
            }
            else if (filter === 'monthly') {
                startDate = now.clone().startOf('month').toDate();
                endDate = now.clone().endOf('month').toDate();
            }
            else if (filter === 'yearly') {
                startDate = now.clone().startOf('year').toDate();
                endDate = now.clone().endOf('year').toDate();
            }
            else {
                throw new common_1.BadRequestException('Invalid filter');
            }
        }
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
                if (overdue)
                    return "OVERDUE";
            }
            return loan.status;
        }
        const loansByStatus = {};
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
                totalAmount: loanAmounts._sum.newAmount
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
        const now = (0, moment_timezone_1.default)().tz("Asia/Riyadh");
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
        const totalRepayment = (dueAgg._sum.principalAmount || 0) +
            (dueAgg._sum.interestAmount || 0);
        const paidAgg = await this.prisma.repayment.aggregate({
            _sum: { paidAmount: true },
            where: { paymentDate: dateFilter },
        });
        const totalPaid = paidAgg._sum.paidAmount || 0;
        const totalRemaining = Math.max(totalRepayment - totalPaid, 0);
        const collectionPercentage = totalRepayment > 0
            ? Math.round((totalPaid / totalRepayment) * 100)
            : 0;
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
    async getUpcomingRepayments(limit = 5) {
        const now = (0, moment_timezone_1.default)().tz("Asia/Riyadh").toDate();
        return await this.prisma.repayment.findMany({
            where: {
                OR: [
                    {
                        newDueDate: {
                            gte: now,
                        },
                        status: "PENDING",
                    },
                    {
                        dueDate: {
                            gte: now,
                        },
                        status: "PENDING",
                    },
                ],
            },
            orderBy: [
                { newDueDate: 'asc' },
                { dueDate: 'asc' },
            ],
            take: limit,
            include: {
                loan: {
                    select: {
                        id: true,
                        client: {
                            select: { name: true },
                        },
                    },
                },
            },
        });
    }
    async getLastActions(limit = 5) {
        const screensToShow = ["Distribution", "Loans", "Journals", "Partners", "Repayments"];
        return await this.prisma.auditLog.findMany({
            where: {
                screen: {
                    in: screensToShow,
                },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                user: {
                    select: { name: true },
                },
            },
        });
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map