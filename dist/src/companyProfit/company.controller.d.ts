import { CompanyService } from './company.service';
export declare class CompanyController {
    private readonly companyService;
    constructor(companyService: CompanyService);
    withdrawProfit(req: any, amount: number): Promise<{
        message: string;
    }>;
    getProfitReport(page: number, limit?: number, search?: string, startDate?: string, endDate?: string): Promise<{
        totalPages: number;
        currentPage: number;
        limit: number;
        availableAmount: number;
        totalWithdrawals: number;
        withdrawals: {
            id: number;
            reference: string | null;
            description: string | null;
            date: string;
            amount: number;
        }[];
    }>;
}
