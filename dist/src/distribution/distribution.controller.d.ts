import { DistributionService } from './distribution.service';
export declare class DistributionController {
    private readonly distributionService;
    constructor(distributionService: DistributionService);
    postClosing(req: any, periodId: string, savingPercentage?: number): Promise<{
        message: string;
        closingJournalId: number;
    }>;
    reverseClosing(req: any, periodId: string): Promise<{
        message: string;
        periodId: number;
    }>;
    getClosedPeriods(periodId?: number): Promise<{
        periodId: number;
        name: string;
        startDate: Date;
        endDate: Date | null;
        closingJournalId: number | null;
        isDistributed: boolean;
        companyProfit: number;
        totalSaving: number;
        totalAfterSaving: number;
        partners: {
            partnerId: number;
            partnerName: string;
            nationalId: string;
            phone: string | null;
            orgProfitPercent: number;
            totalProfit: number;
            savingAmount: number;
            totalAfterSaving: number;
        }[];
        distributionJournal: {
            id: number;
            reference: string | null;
            description: string | null;
            date: Date;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            postedById: number | null;
            periodId: number | null;
            createdAt: Date;
        } | null;
    }[]>;
}
