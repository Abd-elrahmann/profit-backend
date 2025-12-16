import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class ClientReportService {
    constructor(private readonly prisma: PrismaService) { }

    async getAllClients(
        page: number,
        limit = 20,
        filters?: { status?: 'ACTIVE' | 'COMPLETE' | 'نشط' | 'منتهي' },
    ) {
        const allClients = await this.prisma.client.findMany({
            orderBy: { id: 'asc' },
            include: {
                loans: {
                    include: {
                        repayments: true,
                    },
                },
            },
        });

        // Filter out clients with no loans
        const clientsWithLoans = allClients.filter((c) => c.loans.length > 0);

        const processedClients = clientsWithLoans.map((c) => {
            const loans = c.loans;

            // SAFE total debit calculation
            const totalDebit = loans.reduce((sum, loan) => {
                const debit =
                    loan.newAmount && loan.newAmount > 0
                        ? loan.newAmount
                        : loan.totalAmount;
                return Math.round((sum + debit) * 100) / 100;
            }, 0);

            // Total paid calculation
            const totalPaid = loans.reduce((sum, loan) => {
                const paid = loan.repayments.reduce(
                    (rSum, r) => Math.round((rSum + r.paidAmount) * 100) / 100,
                    0
                );
                return Math.round((sum + paid) * 100) / 100;
            }, 0);

            const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;

            return {
                client: c,
                loans,
                totalDebit,
                totalPaid,
                remaining,
            };
        });

        const filtered = processedClients.filter((obj) => {
            if (!filters?.status) return true;

            if (filters.status === 'COMPLETE') {
                return obj.remaining <= 0;
            }

            if (filters.status === 'ACTIVE') {
                return obj.remaining > 0;
            }

            return true;
        });

        const totalClients = filtered.length;
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        const result = paginated.map((obj) => {
            const { client: c, loans, totalDebit, totalPaid, remaining } = obj;

            const loansCount = loans.length;
            const activeLoans = loans.filter((l) => l.status === 'ACTIVE').length;
            const completedLoans = loans.filter((l) => l.status === 'COMPLETED').length;
            const overdueLoans = loans.filter((l) =>
                l.repayments.some((r) => r.status === 'OVERDUE')
            ).length;

            let totalRepayments = 0;
            let paidRepayments = 0;
            let remainingRepayments = 0;

            loans.forEach((loan) => {
                totalRepayments += loan.repayments.length;
                paidRepayments += loan.repayments.filter(
                    (r) => r.status === 'PAID' || r.status === 'EARLY_PAID'
                ).length;
                remainingRepayments += loan.repayments.filter(
                    (r) => r.status === 'PENDING'
                ).length;
            });

            // Discounts
            const totalDiscounts = loans.reduce(
                (sum, loan) =>
                    Math.round((sum + (loan.earlyPaymentDiscount ?? 0)) * 100) / 100,
                0
            );

            // Interest paid
            const totalInterestPaid = loans.reduce(
                (sum, loan) =>
                    Math.round(
                        (
                            sum +
                            loan.repayments.reduce(
                                (rSum, r) =>
                                    Math.round(((rSum + (r.interestAmount ?? 0)) * 100)) /
                                    100,
                                0
                            )
                        ) * 100
                    ) / 100,
                0
            );

            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                address: c.address,
                note: c.notes,
                createdAt: c.createdAt,

                loansSummary: {
                    loansCount,
                    activeLoans,
                    completedLoans,
                    overdueLoans,
                },

                repaymentSummary: {
                    totalRepayments,
                    paidRepayments,
                    remainingRepayments,
                },

                financials: {
                    totalDebit,
                    totalPaid,
                    remaining,
                    totalDiscounts,
                    totalInterestPaid,
                },
            };
        });

        return {
            page,
            limit,
            totalClients,
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

    async updateClientNote(clientId: number, note: string) {
        const client = await this.prisma.client.findUnique({
            where: { id: clientId },
        });

        if (!client) throw new BadRequestException('Client not found');

        const updatedClient = await this.prisma.client.update({
            where: { id: clientId },
            data: { notes: note },
        });

        return {
            success: true,
            message: 'Note updated successfully',
            client: {
                id: updatedClient.id,
                notes: updatedClient.notes,
            },
        };
    }
}