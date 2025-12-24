import { IncomeStatementService } from './income-statement.service';
export declare class IncomeStatementController {
    private readonly incomeService;
    constructor(incomeService: IncomeStatementService);
    getIncomeStatement(from?: string, to?: string, month?: string, year?: string, periodId?: string): Promise<{
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
            profitPercentage: number;
        }[];
        totalRevenue: number;
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
