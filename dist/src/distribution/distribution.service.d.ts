import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class DistributionService {
    private readonly prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    postClosing(periodId: number, userId: number, savingPercentage?: number): Promise<{
        message: string;
        closingJournalId: number;
    }>;
    reverseClosing(periodId: number, userId: number): Promise<{
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
