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
        upcomingProfit: number;
        totalWithdrawals: number;
        data: {
            id: number;
            reference: string | null;
            description: string | null;
            date: string;
            hijriDate: any;
            amount: number;
        }[];
        periodsProfit: {
            totalCompanyProfit: number;
            periodsCount: number;
            periods: {
                periodId: number | undefined;
                periodName: string | undefined;
                date: string;
                hijriDate: any;
                totalPeriodProfit: number;
                companyProfit: number;
                companyPercentage: number;
            }[];
        };
    }>;
}
