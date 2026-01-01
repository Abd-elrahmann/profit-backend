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
            partnerName: string;
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
