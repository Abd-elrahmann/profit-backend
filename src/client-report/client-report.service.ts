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


        const clientsWithLoans = allClients.filter((c) => c.loans.length > 0);

        const processedClients = clientsWithLoans.map((c) => {

            const allLoans = c.loans;
            const activeLoans = allLoans.filter((l) => l.status === 'ACTIVE');

            const loansForFinancials =
                filters?.status === 'ACTIVE'
                    ? activeLoans
                    : allLoans;


            const totalDebit = loansForFinancials.reduce((sum, loan) => {
                const debit =
                    loan.newAmount && loan.newAmount > 0
                        ? loan.newAmount
                        : loan.totalAmount;
                return Math.round((sum + debit) * 100) / 100;
            }, 0);


            const totalPaid = loansForFinancials.reduce((sum, loan) => {
                const paid = loan.repayments.reduce(
                    (rSum, r) => Math.round((rSum + r.paidAmount) * 100) / 100,
                    0
                );
                return Math.round((sum + paid) * 100) / 100;
            }, 0);

            const remaining = Math.round((totalDebit - totalPaid) * 100) / 100;

            return {
                client: c,
                loansForFinancials,
                totalDebit,
                totalPaid,
                remaining,
            };
        });

        const filtered = processedClients.filter(({ client }) => {
            const loans = client.loans;

            if (!filters?.status) return true;

            if (filters.status === 'ACTIVE') {
                return loans.some((l) => l.status === 'ACTIVE');
            }

            if (filters.status === 'COMPLETE') {
                return loans.every((l) => l.status === 'COMPLETED');
            }

            return true;
        });

        const totalClients = filtered.length;
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        const result = paginated.map((obj) => {
            const { client: c, loansForFinancials, totalDebit, totalPaid, remaining } = obj;
            const loans = c.loans;


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


            const totalDiscounts = loans.reduce(
                (sum, loan) =>
                    Math.round((sum + (loan.earlyPaymentDiscount ?? 0)) * 100) / 100,
                0
            );


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

            const pendingRepayments = loansForFinancials.flatMap(loan =>
                loan.repayments.filter(r => r.status === 'PENDING')
            );

            const monthlyInstallment = loansForFinancials.reduce((sum, loan) => {
                if (!loan.repayments.length) return sum;

                const loanAmount = loan.paymentAmount

                return sum + loanAmount;
            }, 0);

            const averageMonthlyInstallment = monthlyInstallment;

            const dueRepayments = loansForFinancials.flatMap(loan =>
                loan.repayments.filter(r =>
                    (r.status === 'PENDING' || r.status === 'OVERDUE') && DateTime.fromJSDate(r.dueDate) <= DateTime.now()
                )
            );

            const dueAmount = dueRepayments.reduce((sum, r) => {
                const repaymentTotal = (r.principalAmount ?? 0) + (r.interestAmount ?? 0);
                const repaymentRemaining = Math.round((repaymentTotal - (r.paidAmount ?? 0)) * 100) / 100;
                return Math.round((sum + repaymentRemaining) * 100) / 100;
            }, 0);

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
                    averageMonthlyInstallment,
                    dueAmount,
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


        const totalRepayments = allRepayments.length;
        const paidRepayments = allRepayments.filter(
            (r) => r.status === 'PAID' || r.status === 'EARLY_PAID'
        ).length;

        const pendingRepayments = totalRepayments - paidRepayments;

        const overdueRepayments = allRepayments.filter(
            (r) => r.status === 'OVERDUE'
        ).length;


        const totalDebit = client.loans.reduce(
            (sum, loan) =>
                Math.round(
                    (sum + (loan.newAmount ?? loan.totalAmount)) * 100
                ) / 100,
            0
        );


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


        const totalDiscounts = client.loans.reduce(
            (sum, loan) =>
                Math.round(
                    (sum + (loan.earlyPaymentDiscount ?? 0)) * 100
                ) / 100,
            0
        );


        const totalPrincipalPaid = allRepayments.reduce(
            (sum, r) =>
                Math.round(
                    (sum + (r.principalAmount ?? 0)) * 100
                ) / 100,
            0
        );


        const totalInterestPaid =
            Number(
                allRepayments.reduce(
                    (a, r) => a + Math.round(r.interestAmount * 100),
                    0
                ) / 100
            ) || 0;

        const dueRepayments = allRepayments.filter(r =>
            (r.status === 'PENDING' || r.status === 'OVERDUE') && DateTime.fromJSDate(r.dueDate) <= DateTime.now()
        );

        const dueAmount = dueRepayments.reduce((sum, r) => {
            const repaymentTotal = (r.principalAmount ?? 0) + (r.interestAmount ?? 0);
            const repaymentRemaining = Math.round((repaymentTotal - (r.paidAmount ?? 0)) * 100) / 100;
            return Math.round((sum + repaymentRemaining) * 100) / 100;
        }, 0);

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
                dueAmount,
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