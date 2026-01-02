import { PeriodService } from './period.service';
export declare class PeriodController {
    private readonly periodService;
    constructor(periodService: PeriodService);
    closePeriod(req: any, id: number): Promise<{
        message: string;
        periodId: number;
        newPeriodId: number;
    }>;
    reverseClosePeriod(id: number, req: any): Promise<{
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
    getAllPeriods(page: number, filters: any): Promise<{
        totalPeriods: number;
        totalPages: number;
        currentPage: number;
        periods: {
            startDateHijri: any;
            endDateHijri: any;
            id: number;
            createdAt: Date;
            name: string;
            startDate: Date;
            endDate: Date | null;
            openingJournalId: number | null;
            closingJournalId: number | null;
            isClosed: boolean;
        }[];
    }>;
    compare(periodId1: number, periodId2: number): Promise<{
        comparison: {
            period1: {
                id: number;
                name: string;
                startDate: Date;
                endDate: Date;
                isClosed: boolean;
                netProfit: number;
                delinquency: number;
            };
            period2: {
                id: number;
                name: string;
                startDate: Date;
                endDate: Date;
                isClosed: boolean;
                netProfit: number;
                delinquency: number;
            };
            changes: {
                netProfitChange: number;
                netProfitChangePercent: number;
                delinquencyChange: number;
                delinquencyChangePercent: number;
            };
            performance: {
                profitabilityImproved: boolean;
                profitabilityStatus: string;
                delinquencyImproved: boolean;
                delinquencyStatus: string;
                overallStatus: string;
            };
        };
    }>;
}
