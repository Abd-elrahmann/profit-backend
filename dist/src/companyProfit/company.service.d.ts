import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class CompanyService {
    private readonly prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
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
