import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientReportService {
    constructor(private readonly prisma: PrismaService) { }

    async getAllClients(page: number, limit = 20) {
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

            // --- TOTAL DEBIT ---
            const totalDebit = c.loans.reduce(
                (sum, loan) =>
                    Math.round(
                        (sum + (loan.newAmount ?? loan.totalAmount)) * 100
                    ) / 100,
                0
            );

            // --- TOTAL PAID ---
            const totalPaid = c.loans.reduce(
                (sum, loan) =>
                    Math.round(
                        (
                            sum +
                            loan.repayments.reduce(
                                (rSum, r) =>
                                    Math.round(
                                        (rSum + r.paidAmount) * 100
                                    ) / 100,
                                0
                            )
                        ) * 100
                    ) / 100,
                0
            );

            // --- REMAINING ---
            const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;

            const repaymentsCount = c.loans.reduce(
                (cnt, loan) => cnt + loan.repayments.length,
                0
            );

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

    async getClientDetails(clientId: number) {
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

        if (!client) throw new BadRequestException('Client not found');

        const allRepayments = client.repayment;

        // --- COUNTS ---
        const totalRepayments = allRepayments.length;
        const paidRepayments = allRepayments.filter(
            (r) => r.status === 'PAID' || r.status === 'EARLY_PAID'
        ).length;

        const pendingRepayments = totalRepayments - paidRepayments;

        const overdueRepayments = allRepayments.filter(
            (r) => r.status === 'OVERDUE'
        ).length;

        // --- TOTAL DEBIT ---
        const totalDebit = client.loans.reduce(
            (sum, loan) =>
                Math.round(
                    (sum + (loan.newAmount ?? loan.totalAmount)) * 100
                ) / 100,
            0
        );

        // --- TOTAL PAID ---
        const totalPaid = client.loans.reduce(
            (sum, loan) =>
                Math.round(
                    (
                        sum +
                        loan.repayments.reduce(
                            (rSum, r) =>
                                Math.round(
                                    (rSum + r.paidAmount) * 100
                                ) / 100,
                            0
                        )
                    ) * 100
                ) / 100,
            0
        );

        const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;

        // --- DISCOUNTS ---
        const totalDiscounts = client.loans.reduce(
            (sum, loan) =>
                Math.round(
                    (sum + (loan.earlyPaymentDiscount ?? 0)) * 100
                ) / 100,
            0
        );

        // --- PRINCIPAL PAID ---
        const totalPrincipalPaid = allRepayments.reduce(
            (sum, r) =>
                Math.round(
                    (sum + (r.principalAmount ?? 0)) * 100
                ) / 100,
            0
        );

        // --- INTEREST PAID (ALREADY ROUNDED) ---
        const totalInterestPaid =
            Number(
                allRepayments.reduce(
                    (a, r) => a + Math.round(r.interestAmount * 100),
                    0
                ) / 100
            ) || 0;

        // --- LOAN DETAILS ---
        const loans = client.loans.map((loan) => {
            const loanTotalPaid = loan.repayments.reduce(
                (s, r) =>
                    Math.round((s + r.paidAmount) * 100) / 100,
                0
            );

            const loanRemaining =
                Math.round(
                    (
                        (loan.newAmount ?? loan.totalAmount) - loanTotalPaid
                    ) * 100
                ) / 100;

            const loanPaidCount = loan.repayments.filter(
                (r) => r.status === 'PAID' || r.status === 'EARLY_PAID'
            ).length;

            const loanPendingCount =
                loan.repayments.length - loanPaidCount;

            const loanOverdueCount = loan.repayments.filter(
                (r) => r.status === 'OVERDUE'
            ).length;

            return {
                loanId: loan.id,
                code: loan.code,
                amount: loan.amount,
                totalAmount: loan.newAmount ?? loan.totalAmount,
                paidAmount: loanTotalPaid,
                remaining: loanRemaining,
                paidCount: loanPaidCount,
                pendingCount: loanPendingCount,
                overdueCount: loanOverdueCount,
                earlyPaidAmount: loan.earlyPaidAmount,
                discount: loan.earlyPaymentDiscount,
                startDate: loan.startDate,
                endDate: loan.endDate,
                status: loan.status,
                repayments: loan.repayments,
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
}