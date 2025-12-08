import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class PeriodService {
    private readonly prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    private toHijri;
    closePeriod(periodId: number, closingUserId: number): Promise<{
        message: string;
        periodId: number;
        newPeriodId: number;
    }>;
    private closeAccountsWithParents;
    reversePeriodClosing(periodId: number, userId: number): Promise<{
        message: string;
        periodId: number;
        deletedNewPeriodId: number | null;
    }>;
    getPeriodDetails(periodId: number): Promise<{
        id: number;
        name: string;
        startDate: Date;
        startDateHijri: any;
        endDate: Date | null;
        endDateHijri: any;
        totalDebit: number;
        totalCredit: number;
        totalBalance: number;
        journals: {
            id: number;
            reference: string | null;
            description: string | null;
            date: Date;
            dateHijri: any;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            totalDebit: number;
            totalCredit: number;
            lines: {
                id: number;
                accountId: number;
                accountName: string;
                debit: number;
                credit: number;
                description: string | null;
                clientId: number | null;
                clientName: string | undefined;
            }[];
        }[];
        partnerProfits: any[];
        companyProfit: number;
        totalPartnerProfit: number;
        isClosed: true;
    } | {
        id: number;
        name: string;
        startDate: Date;
        startDateHijri: any;
        endDate: Date | null;
        endDateHijri: any;
        journals: {
            id: number;
            reference: string | null;
            description: string | null;
            date: Date;
            dateHijri: any;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            totalDebit: number;
            totalCredit: number;
            lines: {
                id: number;
                accountId: number;
                accountName: string;
                debit: number;
                credit: number;
                description: string | null;
                clientId: number | null;
                clientName: string | undefined;
            }[];
        }[];
        partnerProfits: any[];
        companyProfit: number;
        totalPartnerProfit: number;
        isClosed: false;
        totalDebit?: undefined;
        totalCredit?: undefined;
        totalBalance?: undefined;
    }>;
    private calculateOpenPeriodProfits;
    getAllPeriods(page?: number, filters?: {
        limit?: number;
        name?: string;
        startDate?: string;
        endDate?: string;
        isClosed?: boolean;
    }): Promise<{
        totalPeriods: number;
        totalPages: number;
        currentPage: number;
        periods: {
            startDateHijri: any;
            endDateHijri: any;
            id: number;
            name: string;
            createdAt: Date;
            startDate: Date;
            endDate: Date | null;
            openingJournalId: number | null;
            closingJournalId: number | null;
            isClosed: boolean;
        }[];
    }>;
}
