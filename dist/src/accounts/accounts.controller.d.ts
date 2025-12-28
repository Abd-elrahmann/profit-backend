import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';
export declare class AccountsController {
    private readonly accountsService;
    constructor(accountsService: AccountsService);
    create(dto: CreateAccountDto): Promise<{
        message: string;
        account: {
            name: string;
            code: string;
            type: import("@prisma/client").$Enums.AccountType;
            level: number;
            isActive: boolean;
            credit: number;
            debit: number;
            balance: number;
            nature: import("@prisma/client").$Enums.AccountNature;
            accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            createdAt: Date;
            id: number;
            parentId: number | null;
        };
    }>;
    update(id: number, dto: UpdateAccountDto): Promise<{
        message: string;
        account: {
            name: string;
            code: string;
            type: import("@prisma/client").$Enums.AccountType;
            level: number;
            isActive: boolean;
            credit: number;
            debit: number;
            balance: number;
            nature: import("@prisma/client").$Enums.AccountNature;
            accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            createdAt: Date;
            id: number;
            parentId: number | null;
        };
    }>;
    delete(id: number): Promise<{
        message: string;
    }>;
    getAllAccounts(page: number, limit?: number, search?: string): Promise<{
        total: number;
        page: number;
        limit: number;
        accounts: {
            name: string;
            code: string;
            type: import("@prisma/client").$Enums.AccountType;
            level: number;
            isActive: boolean;
            credit: number;
            debit: number;
            balance: number;
            nature: import("@prisma/client").$Enums.AccountNature;
            accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            createdAt: Date;
            id: number;
            parentId: number | null;
        }[];
    }>;
    getTree(): Promise<any[]>;
    getBankAccountReport(page: number, month?: string, limit?: number): Promise<{
        pagination: {
            page: number;
            limit: number;
            totalJournals: number;
            totalPages: number;
        };
        account: {
            id: number;
            name: string;
            code: string;
            debit: number;
            credit: number;
            balance: number;
        };
        loansBalance: number;
        total: number;
        totalJournalEntries: number;
        journalsByMonth: Record<string, {
            entries: any[];
            totalDebit: number;
            totalCredit: number;
            totalBalance: number;
        }>;
        repayments: {
            totalAmount: number;
            paidUntilNow: number;
        };
        currentMonth: {
            totalAmount: number;
            paidUntilNow: number;
        };
    }>;
    getNEWBankAccountReport(page: number, month?: string, limit?: number): Promise<{
        pagination: {
            page: number;
            limit: number;
            totalJournals: number;
            totalPages: number;
        };
        account: {
            id: number;
            name: string;
            code: string;
            debit: number;
            credit: number;
            balance: number;
        };
        loansBalance: number;
        total: number;
        totalJournalEntries: number;
        journalsByMonth: Record<string, {
            entries: any[];
            totalDebit: number;
            totalCredit: number;
            totalBalance: number;
        }>;
        repayments: {
            totalAmount: number;
            paidUntilNow: number;
        };
        currentMonth: {
            totalAmount: number;
            paidUntilNow: number;
        };
    }>;
    getAccountDetails(id: number): Promise<{
        children: {
            name: string;
            code: string;
            type: import("@prisma/client").$Enums.AccountType;
            level: number;
            isActive: boolean;
            credit: number;
            debit: number;
            balance: number;
            nature: import("@prisma/client").$Enums.AccountNature;
            accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            createdAt: Date;
            id: number;
            parentId: number | null;
        }[];
    } & {
        name: string;
        code: string;
        type: import("@prisma/client").$Enums.AccountType;
        level: number;
        isActive: boolean;
        credit: number;
        debit: number;
        balance: number;
        nature: import("@prisma/client").$Enums.AccountNature;
        accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
        createdAt: Date;
        id: number;
        parentId: number | null;
    }>;
    getAccountById(id: number, page: number, from?: string, to?: string, limit?: string): Promise<{
        totalPages: number;
        currentPage: number;
        limit: number;
        account: {
            balance: number;
            debit: number;
            credit: number;
            children: {
                name: string;
                code: string;
                type: import("@prisma/client").$Enums.AccountType;
                level: number;
                isActive: boolean;
                credit: number;
                debit: number;
                balance: number;
                nature: import("@prisma/client").$Enums.AccountNature;
                accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
                createdAt: Date;
                id: number;
                parentId: number | null;
            }[];
            name: string;
            code: string;
            type: import("@prisma/client").$Enums.AccountType;
            level: number;
            isActive: boolean;
            nature: import("@prisma/client").$Enums.AccountNature;
            accountBasicType: import("@prisma/client").$Enums.AccountBasicType;
            createdAt: Date;
            id: number;
            parentId: number | null;
        };
        totalJournals: number;
        journals: {
            id: number;
            reference: string | null;
            description: string | null;
            date: string;
            hijriDate: any;
            status: import("@prisma/client").$Enums.JournalStatus;
            type: import("@prisma/client").$Enums.JournalType;
            postedBy: string | null;
            lines: {
                id: number;
                description: string | null;
                debit: number;
                credit: number;
                balance: number;
                client: {
                    id: number;
                    name: string;
                } | null;
                account: {
                    name: string;
                    code: string;
                    id: number;
                };
            }[];
        }[];
        periodSummary: {
            debit: number;
            credit: number;
            balance: number;
        };
    }>;
}
