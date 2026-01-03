import { BankService } from './bank.service';
export declare class BankController {
    private readonly bankService;
    constructor(bankService: BankService);
    createBankAccount(req: any, body: {
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
    getAllBankAccounts(page: number, limit?: number, search?: string): Promise<{
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
    getBankAccountById(id: string): Promise<{
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
            promissionaryDate: Date;
            fromClientId: number | null;
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
    updateBankAccount(req: any, id: string, body: {
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
    deleteBankAccount(req: any, id: string): Promise<{
        id: number;
        name: string;
        limit: number;
        status: import("@prisma/client").$Enums.AccountStatus;
        owner: string;
        accountNumber: string;
        IBAN: string;
    }>;
}
