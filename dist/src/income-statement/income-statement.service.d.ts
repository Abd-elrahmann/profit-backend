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
            capitalAmount: number;
            totalProfit: number;
            newCapitalAmount: number;
            totalAmount: number;
        }[];
        revenues: {
            total: number;
            generalLoans: number;
            newCapitalLoans: number;
        };
        revenueByClient: {
            clientId: any;
            clientName: any;
            totalRevenue: number;
            companyRevenue: number;
            partnersRevenue: number;
            entries: {
                loanId: number;
                rawShare: number;
                companyCut: number;
                partnerShare: number;
                description: string;
            }[];
        }[];
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
