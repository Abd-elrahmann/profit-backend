import { PrismaService } from '../prisma/prisma.service';
export declare class DashboardService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getClientStats(filter?: 'daily' | 'monthly' | 'yearly'): Promise<{
        count: number;
        totalDebit: number;
        totalPaid: number;
        remaining: number;
        activeCount: number;
        overdueCount: number;
        newClientsToday: number;
        filter: string;
        range: {
            startDate: Date | undefined;
            endDate: Date | undefined;
        };
    }>;
    getPartnerStats(filter?: 'daily' | 'monthly' | 'yearly'): Promise<{
        partnersCount: number;
        activePartners: number;
        inactivePartners: number;
        totalCapitalAmount: number;
        totalProfit: number;
        filter: string;
        range: {
            startDate: Date | undefined;
            endDate: Date | undefined;
        };
    }>;
    getLoanAndBankStats(filter?: 'daily' | 'monthly' | 'yearly'): Promise<{
        loans: {
            count: number;
            byStatus: Record<string, number>;
            totalAmount: number;
        };
        bank: {
            balance: number;
        };
        filter: string;
        range: {
            startDate: Date | undefined;
            endDate: Date | undefined;
        };
    }>;
    getMonthlyCollection(): Promise<{
        range: {
            startDate: Date;
            endDate: Date;
        };
        totalRepayment: number;
        totalPaid: number;
        totalRemaining: number;
        collectionPercentage: number;
        bankAccount: {
            id: number;
            code: string;
            name: string;
            credit: number;
            debit: number;
            balance: number;
        } | null;
        loansBalance: number;
        total: number;
        repaymentsSummary: {
            totalAmount: number;
            paidUntilNow: number;
            remaining: number;
        };
        currentMonth: {
            totalAmount: number;
            paidUntilNow: number;
            remaining: number;
        };
    }>;
    getUpcomingRepayments(limit?: number): Promise<({
        loan: {
            id: number;
            client: {
                name: string;
            };
        };
    } & {
        createdAt: Date;
        principalAmount: number;
        interestAmount: number;
        dueDate: Date;
        newDueDate: Date | null;
        count: number;
        id: number;
        loanId: number;
        clientId: number;
        amount: number;
        remaining: number;
        paidAmount: number;
        paymentDate: Date | null;
        status: import("@prisma/client").$Enums.PaymentStatus;
        attachments: string[];
        PaymentProof: string | null;
        reviewStatus: string | null;
        notes: string | null;
        postponeApproved: boolean | null;
        postponeReason: string | null;
    })[]>;
    getLastActions(limit?: number): Promise<({
        user: {
            name: string;
        };
    } & {
        createdAt: Date;
        id: number;
        userId: number;
        screen: string;
        action: string;
        description: string | null;
    })[]>;
}
