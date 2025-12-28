import { PrismaService } from '../prisma/prisma.service';
export declare class IncomeStatementService {
    private prisma;
    constructor(prisma: PrismaService);
    getIncomeStatement(params: {
        fromDate?: string;
        toDate?: string;
        month?: number;
        year?: number;
        periodId?: number;
    }): Promise<{
        period: {
            from: string;
            to: string;
            source: string;
            periodId: number | null;
        };
        totalCapital: number;
        capitalByPartner: {
            partnerId: number;
            partnerName: string;
            capitalAmount: number;
            newCapitalTotal: number;
            newCapitalRemaining: number;
            usedInActiveLoans: number;
            profitPercentage: number;
            totalAmount: number;
        }[];
        totalRevenue: number;
        revenues: {
            total: number;
            generalLoans: number;
            newCapitalLoans: number;
        };
        revenueByClient: any[];
        totalExpenses: number;
        detailedExpenses: {
            type: string;
            amount: number;
            description: string | null;
            employee: string | null;
            createdAt: string;
        }[];
        netProfit: number;
    }>;
}
