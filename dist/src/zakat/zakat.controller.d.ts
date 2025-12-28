import { ZakatService } from './zakat.service';
import { ZakatSchedulerService } from './zakat.scheduler';
export declare class ZakatController {
    private readonly zakatService;
    private readonly zakatScheduler;
    constructor(zakatService: ZakatService, zakatScheduler: ZakatSchedulerService);
    summary(partnerId: string, year?: string): Promise<{
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
    } | {
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
    }[]>;
    summaryAll(year: string, page?: string, limit?: string): Promise<{
        data: {
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
        }[];
        pagination: {
            totalPartners: number;
            totalPages: number;
            currentPage: number;
            limit: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }>;
    withdrawZakat(amount: number, req: any): Promise<{
        message: string;
        journalId: number;
    }>;
    zakatAccountReport(month?: string): Promise<{
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
    uploadMudarabahFile(req: any, file: Express.Multer.File): Promise<{
        message: string;
        path: string;
    }>;
    testMonthly(): Promise<{
        message: string;
    }>;
    testYearEnd(): Promise<{
        message: string;
    }>;
    runNextYearZakatAccruals(): Promise<{
        message: string;
    }>;
}
