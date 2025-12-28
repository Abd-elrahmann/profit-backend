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
            partnerName: string;
            totalAmount: number;
        }[];
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
