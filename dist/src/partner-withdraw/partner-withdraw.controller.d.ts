import { PartnerWithdrawService } from './partner-withdraw.service';
export declare class PartnerWithdrawController {
    private readonly service;
    constructor(service: PartnerWithdrawService);
    withdrawPartner(req: any, partnerId: number, amount: number): Promise<{
        message: string;
        withdrawal: {
            id: number;
            createdAt: Date;
            partnerId: number;
            WITHDRAWAL_RECEIPT: string | null;
            totalCapital: number;
            defaultShare: number;
            remainingCapital: number;
            savingAmount: number;
        };
        schedule: any;
        savingsAmount: number;
        partnerDefaultShare: number;
        remainingCapital: number;
    }>;
    previewDefaultShare(partnerId: number): Promise<{
        partnerId: number;
        partnerName: string;
        defaultsBase: number;
        orgProfitPercent: number;
        operationalRatio: number;
        partnerDefaultShare: number;
    }>;
    updateWithdrawalAmount(req: any, partnerId: number, amount: number): Promise<{
        message: string;
        monthlyAmount: number;
        schedule: any;
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
            partnerId: number;
            WITHDRAWAL_RECEIPT: string | null;
            totalCapital: number;
            defaultShare: number;
            remainingCapital: number;
            savingAmount: number;
        };
        schedule: {
            id: number;
            createdAt: Date;
            year: number;
            status: string;
            amount: number;
            partnerId: number;
            month: number;
            remaining: number;
            paidAmount: number;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        }[];
        journals: ({
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                clientId: number | null;
                accountId: number;
                journalId: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            postedById: number | null;
            reference: string | null;
            type: import("@prisma/client").$Enums.JournalType;
            status: import("@prisma/client").$Enums.JournalStatus;
            sourceId: number | null;
            sourceType: import("@prisma/client").$Enums.JournalSourceType | null;
            periodId: number | null;
        })[];
    }>;
    approveWithdrawalPayment(req: any, scheduleId: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            year: number;
            status: string;
            amount: number;
            partnerId: number;
            month: number;
            remaining: number;
            paidAmount: number;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        };
        journalIds: number[];
    }>;
    rejectWithdrawalPayment(req: any, scheduleId: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            year: number;
            status: string;
            amount: number;
            partnerId: number;
            month: number;
            remaining: number;
            paidAmount: number;
            isPaid: boolean;
            carryAmount: number | null;
            carryFromId: number | null;
            paidAt: Date | null;
        };
        undone: number[];
    }>;
    partialPayment(req: any, scheduleId: number, paidAmount: number): Promise<{
        message: string;
        schedule: {
            id: number;
            createdAt: Date;
            year: number;
            status: string;
            amount: number;
            partnerId: number;
            month: number;
            remaining: number;
            paidAmount: number;
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
    getAllWithdrawingPartners(page: number, limit?: number): Promise<{
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
                partnerId: number;
                WITHDRAWAL_RECEIPT: string | null;
                totalCapital: number;
                defaultShare: number;
                remainingCapital: number;
                savingAmount: number;
            };
        }[];
    }>;
    uploadWithdrawalReceipt(req: any, partnerId: number, file: Express.Multer.File): Promise<{
        message: string;
        path: string;
    }>;
}
