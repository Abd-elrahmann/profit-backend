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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnersReportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let PartnersReportService = class PartnersReportService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllPartners(page, limit = 20) {
        const skip = (page - 1) * limit;
        const partners = await this.prisma.partner.findMany({
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                loans: true,
                transactions: true,
                profitAccruals: true,
                ZakatAccrual: true,
                ZakatPayment: true,
            },
        });
        const result = partners.map((p) => {
            const payableBalance = p.AccountPayable?.balance || 0;
            const equityBalance = p.AccountEquity?.balance || 0;
            return {
                id: p.id,
                name: p.name,
                phone: p.phone,
                nationalId: p.nationalId,
                capitalAmount: p.capitalAmount,
                totalProfit: p.totalProfit,
                totalAmount: p.totalAmount,
                accountBalance: payableBalance + equityBalance,
                loansCount: p.loans.length,
                totalDeposits: p.transactions
                    .filter(t => t.type === 'DEPOSIT')
                    .reduce((s, t) => s + t.amount, 0),
                totalWithdrawals: p.transactions
                    .filter(t => t.type === 'WITHDRAWAL')
                    .reduce((s, t) => s + t.amount, 0),
                totalAccruedProfit: p.profitAccruals.reduce((s, a) => s + a.partnerFinal, 0),
                zakat: {
                    required: p.yearlyZakatRequired || 0,
                    paid: p.yearlyZakatPaid || 0,
                    balance: p.yearlyZakatBalance || 0,
                },
            };
        });
        const total = await this.prisma.partner.count();
        return {
            page,
            limit,
            totalPartners: total,
            data: result,
        };
    }
    async getPartnerDetails(id) {
        const partner = await this.prisma.partner.findUnique({
            where: { id },
            include: {
                AccountPayable: true,
                AccountEquity: true,
                loans: {
                    include: {
                        LoanPartnerShare: true,
                    },
                },
                transactions: true,
                profitAccruals: {
                    include: {
                        loan: true,
                        repayment: true,
                        period: true,
                    },
                },
                PartnerPeriodProfit: {
                    include: {
                        savings: true,
                    },
                },
                ZakatAccrual: true,
                ZakatPayment: true,
                PartnerSavingAccrual: {
                    include: {
                        accrual: true,
                    },
                },
            },
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const totalLoans = partner.loans.length;
        const activeLoans = partner.loans.filter(l => l.status === "ACTIVE").length;
        const completedLoans = partner.loans.filter(l => l.status === "COMPLETED").length;
        const totalLoanAmount = partner.loans.reduce((sum, loan) => sum + (loan.newAmount ?? loan.totalAmount), 0);
        const totalDeposits = partner.transactions
            .filter(t => t.type === "DEPOSIT")
            .reduce((s, t) => s + t.amount, 0);
        const totalWithdrawals = partner.transactions
            .filter(t => t.type === "WITHDRAWAL")
            .reduce((s, t) => s + t.amount, 0);
        const totalRawShare = partner.profitAccruals.reduce((s, a) => s + a.rawShare, 0);
        const totalCompanyCut = partner.profitAccruals.reduce((s, a) => s + a.companyCut, 0);
        const totalPartnerProfit = partner.profitAccruals.reduce((s, a) => s + a.partnerFinal, 0);
        const distributedProfit = partner.profitAccruals
            .filter(a => a.isDistributed)
            .reduce((s, a) => s + a.partnerFinal, 0);
        const undistributedProfit = totalPartnerProfit - distributedProfit;
        const totalSavings = partner.PartnerSavingAccrual.reduce((s, a) => s + Number(a.savingAmount), 0);
        const periodsWithSavings = partner.PartnerSavingAccrual.length;
        const totalPeriodProfits = partner.PartnerPeriodProfit.reduce((s, p) => s + p.totalProfit, 0);
        const periodsCount = partner.PartnerPeriodProfit.length;
        const totalZakatAccrued = Math.round(partner.ZakatAccrual.reduce((s, a) => s + a.amount, 0) * 100) / 100;
        const totalZakatPaid = Math.round(partner.ZakatPayment.reduce((s, p) => s + p.amount, 0) * 100) / 100;
        const zakatBalance = totalZakatAccrued - totalZakatPaid;
        return {
            profile: {
                id: partner.id,
                name: partner.name,
                nationalId: partner.nationalId,
                phone: partner.phone,
                orgProfitPercent: partner.orgProfitPercent,
                capitalAmount: partner.capitalAmount,
                totalProfit: partner.totalProfit,
                totalAmount: partner.totalAmount,
                createdAt: partner.createdAt,
            },
            loans: partner.loans,
            transactions: partner.transactions,
            periodProfits: partner.PartnerPeriodProfit,
            summary: {
                loans: {
                    totalLoans,
                    activeLoans,
                    completedLoans,
                    totalLoanAmount,
                },
                transactions: {
                    totalDeposits,
                    totalWithdrawals,
                },
                profits: {
                    totalRawShare,
                    totalCompanyCut,
                    totalPartnerProfit,
                    distributedProfit,
                    undistributedProfit,
                },
                savings: {
                    totalSavings,
                    periodsWithSavings,
                },
                periodProfits: {
                    totalPeriodProfits,
                    periodsCount,
                },
                zakat: {
                    totalZakatAccrued,
                    totalZakatPaid,
                    zakatBalance,
                },
            },
        };
    }
};
exports.PartnersReportService = PartnersReportService;
exports.PartnersReportService = PartnersReportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PartnersReportService);
//# sourceMappingURL=partners-report.service.js.map