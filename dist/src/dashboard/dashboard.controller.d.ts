import { DashboardService } from './dashboard.service';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
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
            name: string;
            debit: number;
            credit: number;
            balance: number;
            code: string;
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
    getUpcomingRepayments(): Promise<({
        loan: {
            client: {
                name: string;
            };
            id: number;
        };
    } & {
        id: number;
        createdAt: Date;
        attachments: string[];
        status: import("@prisma/client").$Enums.PaymentStatus;
        notes: string | null;
        clientId: number;
        amount: number;
        interestAmount: number;
        count: number;
        loanId: number;
        dueDate: Date;
        remaining: number;
        paidAmount: number;
        principalAmount: number;
        paymentDate: Date | null;
        PaymentProof: string | null;
        reviewStatus: string | null;
        postponeApproved: boolean | null;
        postponeReason: string | null;
        newDueDate: Date | null;
    })[]>;
    getLastActions(): Promise<({
        user: {
            name: string;
        };
    } & {
        id: number;
        createdAt: Date;
        screen: string;
        action: string;
        description: string | null;
        userId: number;
    })[]>;
}
