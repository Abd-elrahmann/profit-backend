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
exports.ClientReportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ClientReportService = class ClientReportService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllClients(page, limit = 20) {
        const skip = (page - 1) * limit;
        const clients = await this.prisma.client.findMany({
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                loans: {
                    include: {
                        repayments: true,
                    },
                },
            },
        });
        const result = clients.map((c) => {
            const loansCount = c.loans.length;
            const totalDebit = c.loans.reduce((sum, loan) => Math.round((sum + (loan.newAmount ?? loan.totalAmount)) * 100) / 100, 0);
            const totalPaid = c.loans.reduce((sum, loan) => Math.round((sum +
                loan.repayments.reduce((rSum, r) => Math.round((rSum + r.paidAmount) * 100) / 100, 0)) * 100) / 100, 0);
            const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;
            const repaymentsCount = c.loans.reduce((cnt, loan) => cnt + loan.repayments.length, 0);
            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                note: c.notes,
                loansCount,
                repaymentsCount,
                totalDebit,
                totalPaid,
                remaining,
            };
        });
        const total = await this.prisma.client.count();
        return {
            page,
            limit,
            totalClients: total,
            data: result,
        };
    }
    async getClientDetails(clientId) {
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
            include: {
                loans: {
                    include: {
                        repayments: true,
                    },
                },
                repayment: true,
            },
        });
        if (!client)
            throw new common_1.BadRequestException('Client not found');
        const allRepayments = client.repayment;
        const totalRepayments = allRepayments.length;
        const paidRepayments = allRepayments.filter((r) => r.status === 'PAID' || r.status === 'EARLY_PAID').length;
        const pendingRepayments = totalRepayments - paidRepayments;
        const overdueRepayments = allRepayments.filter((r) => r.status === 'OVERDUE').length;
        const totalDebit = client.loans.reduce((sum, loan) => Math.round((sum + (loan.newAmount ?? loan.totalAmount)) * 100) / 100, 0);
        const totalPaid = client.loans.reduce((sum, loan) => Math.round((sum +
            loan.repayments.reduce((rSum, r) => Math.round((rSum + r.paidAmount) * 100) / 100, 0)) * 100) / 100, 0);
        const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;
        const totalDiscounts = client.loans.reduce((sum, loan) => Math.round((sum + (loan.earlyPaymentDiscount ?? 0)) * 100) / 100, 0);
        const totalPrincipalPaid = allRepayments.reduce((sum, r) => Math.round((sum + (r.principalAmount ?? 0)) * 100) / 100, 0);
        const totalInterestPaid = Number(allRepayments.reduce((a, r) => a + Math.round(r.interestAmount * 100), 0) / 100) || 0;
        const loans = client.loans.map((loan) => {
            const loanTotalPaid = loan.repayments.reduce((s, r) => Math.round((s + r.paidAmount) * 100) / 100, 0);
            const loanRemaining = Math.round(((loan.newAmount ?? loan.totalAmount) - loanTotalPaid) * 100) / 100;
            const loanPaidCount = loan.repayments.filter((r) => r.status === 'PAID' || r.status === 'EARLY_PAID').length;
            const loanPendingCount = loan.repayments.length - loanPaidCount;
            const loanOverdueCount = loan.repayments.filter((r) => r.status === 'OVERDUE').length;
            return {
                loanId: loan.id,
                code: loan.code,
                amount: loan.amount,
                interest: loan.interestAmount,
                discount: loan.earlyPaymentDiscount,
                totalAmount: loan.newAmount ?? loan.totalAmount,
                paidAmount: loanTotalPaid,
                remaining: loanRemaining,
                paidCount: loanPaidCount,
                pendingCount: loanPendingCount,
                overdueCount: loanOverdueCount,
                startDate: loan.startDate,
                endDate: loan.endDate,
                status: loan.status,
            };
        });
        return {
            client: {
                id: client.id,
                name: client.name,
                phone: client.phone,
                email: client.email,
                address: client.address,
                notes: client.notes,
                status: client.status,
                createdAt: client.createdAt,
            },
            totals: {
                totalRepayments,
                paidRepayments,
                pendingRepayments,
                overdueRepayments,
                totalDebit,
                totalPaid,
                remaining,
                totalDiscounts,
                totalPrincipalPaid,
                totalInterestPaid,
            },
            loans,
        };
    }
};
exports.ClientReportService = ClientReportService;
exports.ClientReportService = ClientReportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ClientReportService);
//# sourceMappingURL=client-report.service.js.map