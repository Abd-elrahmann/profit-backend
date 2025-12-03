import { PrismaService } from '../prisma/prisma.service';
export declare class SavingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getPartnerSavingSummary(partnerId: number): Promise<any[]>;
    getAllPartnerSavings(page?: number, filters?: {
        limit?: number;
        name?: string;
        nationalId?: string;
        phone?: string;
    }): Promise<{
        data: {
            partnerId: number;
            partnerName: string;
            periods: any[];
        }[];
        pagination: {
            totalPartners: number;
            totalPages: number;
            currentPage: number;
            limit: number;
        };
    }>;
    getSavingAccountReport(month?: string): Promise<{
        account: {
            id: number;
            name: string;
            code: string;
            debit: number;
            credit: number;
            balance: number;
        };
        totalJournalEntries: number;
        journalsByMonth: Record<string, {
            entries: any[];
            totalDebit: number;
            totalCredit: number;
            totalBalance: number;
        }>;
    }>;
}
