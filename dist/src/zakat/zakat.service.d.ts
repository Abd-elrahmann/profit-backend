import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
type ZakatYearSummary = {
    partnerId: number;
    partnerName: string;
    capitalAmount: number;
    year: number;
    annualZakat: number;
    monthlyZakat: number;
    totalPaid: number;
    remaining: number;
    monthlyBreakdown: any[];
    payments?: any[];
};
export declare class ZakatService {
    private readonly prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    getPartnerZakatSummary(partnerId: number, year?: number): Promise<ZakatYearSummary | ZakatYearSummary[]>;
    getYearlyAllPartners(year: number, page?: number, limit?: number): Promise<{
        data: ZakatYearSummary[];
        pagination: {
            totalPartners: number;
            totalPages: number;
            currentPage: number;
            limit: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }>;
    withdrawZakat(amount: number, userId: number): Promise<{
        message: string;
        journalId: number;
    }>;
    getZakatAccountReport(month?: string): Promise<{
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
            requiredZakat: number;
        }>;
    }>;
}
export {};
