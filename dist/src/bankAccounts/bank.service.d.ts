import { PrismaService } from '../prisma/prisma.service';
export declare class BankService {
    private prisma;
    constructor(prisma: PrismaService);
    createBankAccount(currentUser: any, data: {
        name: string;
        owner: string;
        accountNumber: string;
        IBAN: string;
        limit: number;
    }): Promise<{
        id: number;
        name: string;
        limit: number;
        status: import("@prisma/client").$Enums.AccountStatus;
        owner: string;
        accountNumber: string;
        IBAN: string;
    }>;
    getAllBankAccounts(page?: number, limit?: number, filters?: any): Promise<{
        total: number;
        page: number;
        limit: number;
        data: {
            id: number;
            name: string;
            limit: number;
            status: import("@prisma/client").$Enums.AccountStatus;
            owner: string;
            accountNumber: string;
            IBAN: string;
        }[];
    }>;
    getBankAccountById(id: number): Promise<{
        loans: ({
            client: {
                phone: string;
                name: string;
            };
            partner: {
                name: string;
            } | null;
        } & {
            id: number;
            createdAt: Date;
            code: string;
            type: import("@prisma/client").$Enums.LoanType;
            status: import("@prisma/client").$Enums.LoanStatus;
            clientId: number;
            kafeelId: number | null;
            amount: number;
            interestRate: number;
            interestAmount: number;
            totalAmount: number;
            paymentAmount: number;
            durationMonths: number;
            source: import("@prisma/client").$Enums.LoanFundSource;
            startDate: Date;
            endDate: Date | null;
            repaymentDay: Date | null;
            bankAccountId: number | null;
            partnerId: number | null;
            disbursementJournalId: number | null;
            settlementJournalId: number | null;
            DEBT_ACKNOWLEDGMENT: string | null;
            PROMISSORY_NOTE: string | null;
            SETTLEMENT: string | null;
            PAYMENT_PROOF: string[];
            debtAcknowledgmentNumber: string | null;
            promissoryNoteNumber: string | null;
            issuanceCity: string | null;
            paymentCity: string | null;
            earlyPaidAmount: number | null;
            earlyPaymentDiscount: number | null;
            newAmount: number | null;
        })[];
    } & {
        id: number;
        name: string;
        limit: number;
        status: import("@prisma/client").$Enums.AccountStatus;
        owner: string;
        accountNumber: string;
        IBAN: string;
    }>;
    updateBankAccount(currentUser: any, id: number, data: {
        name?: string;
        owner: string;
        accountNumber?: string;
        IBAN?: string;
        limit?: number;
    }): Promise<{
        id: number;
        name: string;
        limit: number;
        status: import("@prisma/client").$Enums.AccountStatus;
        owner: string;
        accountNumber: string;
        IBAN: string;
    }>;
    deleteBankAccount(currentUser: any, id: number): Promise<{
        id: number;
        name: string;
        limit: number;
        status: import("@prisma/client").$Enums.AccountStatus;
        owner: string;
        accountNumber: string;
        IBAN: string;
    }>;
}
