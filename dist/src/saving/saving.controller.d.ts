import { SavingService } from './saving.service';
export declare class SavingController {
    private readonly savingService;
    constructor(savingService: SavingService);
    getPartnerSummary(id: number): Promise<any[]>;
    getAccountReport(month?: string): Promise<{
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
    getAllPartners(page: number, limit?: number, name?: string, nationalId?: string, phone?: string): Promise<{
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
}
