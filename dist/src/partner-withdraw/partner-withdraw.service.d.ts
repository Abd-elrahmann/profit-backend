import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class PartnerWithdrawService {
    private prisma;
    private journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    previewPartnerDefaultShare(partnerId: number): Promise<{
        partnerId: number;
        partnerName: string;
        defaultsBase: number;
        orgProfitPercent: number;
        operationalRatio: number;
        partnerDefaultShare: number;
    }>;
    withdrawPartner(partnerId: number, monthlyAmount: number, userId: number): Promise<{
        message: string;
        withdrawal: {
            id: number;
            createdAt: Date;
            totalCapital: number;
            defaultShare: number;
            remainingCapital: number;
            savingAmount: number;
            WITHDRAWAL_RECEIPT: string | null;
            partnerId: number;
        };
        schedule: any;
        savingsAmount: number;
        partnerDefaultShare: number;
        remainingCapital: number;
    }>;
    getWithdrawalDetails(partnerId: number): Promise<{
        partner: {
            id: number;
            name: string;
            nationalId: string;
            totalCapital: number;
            totalProfit: number;
            savings: number;
            withdrawingStatus: import("@prisma/client").$Enums.PartnerStatus;
            isFrozen: boolean;
        };
        withdrawal: {
            id: number;
            createdAt: Date;
            totalCapital: number;
            defaultShare: number;
            remainingCapital: number;
            savingAmount: number;
            WITHDRAWAL_RECEIPT: string | null;
            partnerId: number;
        };
        schedule: {
            id: number;
            createdAt: Date;
            partnerId: number;
            month: number;
            year: number;
            amount: number;
            paidAmount: number;
            remaining: number;
            status: string;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        }[];
        journals: ({
            lines: {
                id: number;
                credit: number;
                debit: number;
                balance: number;
                description: string | null;
                journalId: number;
                accountId: number;
                clientId: number | null;
            }[];
        } & {
            id: number;
            createdAt: Date;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            reference: string | null;
            description: string | null;
            date: Date;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            postedById: number | null;
            periodId: number | null;
        })[];
    }>;
    approveWithdrawalPayment(currentUser: number, scheduleId: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            partnerId: number;
            month: number;
            year: number;
            amount: number;
            paidAmount: number;
            remaining: number;
            status: string;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        };
        journalIds: number[];
    }>;
    rejectWithdrawalPayment(currentUser: number, scheduleId: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            partnerId: number;
            month: number;
            year: number;
            amount: number;
            paidAmount: number;
            remaining: number;
            status: string;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        };
        undone: number[];
    }>;
    private findNextSchedulesForPartnerAfter;
    partialPayWithdrawal(currentUser: number, scheduleId: number, paidAmount: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            partnerId: number;
            month: number;
            year: number;
            amount: number;
            paidAmount: number;
            remaining: number;
            status: string;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        };
        journalIds: number[];
        allocatedToCarry: number;
        allocatedToOwn: number;
        forwarded: number;
    }>;
    getAllWithdrawingPartners(page?: number, limit?: number): Promise<{
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        data: {
            id: number;
            name: string;
            nationalId: string;
            totalAmount: number;
            savings: number;
            withdrawingStatus: import("@prisma/client").$Enums.PartnerStatus;
            isFrozen: boolean;
            withdrawalRequest: {
                id: number;
                createdAt: Date;
                totalCapital: number;
                defaultShare: number;
                remainingCapital: number;
                savingAmount: number;
                WITHDRAWAL_RECEIPT: string | null;
                partnerId: number;
            };
        }[];
    }>;
    uploadWithdrawalReceipt(currentUser: number, partnerId: number, file: Express.Multer.File): Promise<{
        message: string;
        path: string;
    }>;
    updateWithdrawalMonthlyAmount(currentUser: number, partnerId: number, newMonthlyAmount: number): Promise<{
        message: string;
        monthlyAmount: number;
        schedule: any;
    }>;
}
