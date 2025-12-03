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
        availableForLending: number;
    }>;
    getUpcomingRepayments(limit?: number): Promise<({
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
    getLastActions(limit?: number): Promise<({
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
