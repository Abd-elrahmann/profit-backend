import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class CompanyService {
    private readonly prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    private toHijri;
    withdrawProfit(amount: number, userId: number): Promise<{
        message: string;
    }>;
    getProfitReport(page: number, filters?: {
        limit?: number;
        search?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<{
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
