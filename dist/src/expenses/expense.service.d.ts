import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class ExpenseService {
    private prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    private toHijri;
    private getBankAccount;
    createExpenseJournal(userId: number, expenses: {
        type: string;
        amount: number;
        description?: string;
        userId?: number;
    }[]): Promise<{
        message: string;
        journalId: number;
    }>;
    getExpensesAccountData(page?: number, limit?: number): Promise<{
        total: number;
        page: number;
        limit: number;
        account: {
            totalDebit: any;
            totalCredit: any;
            balance: number;
        };
        journals: any[];
    }>;
    getExpensesRecords(page?: number, limit?: number): Promise<{
        total: number;
        page: number;
        limit: number;
        expenses: {
            id: number;
            journal: number | null;
            type: string;
            amount: number;
            description: string | null;
            createdAt: Date;
            createdAtHijri: any;
            addedBy: {
                id: number;
                name: string;
                email: string;
            } | null;
            employee: {
                id: number;
                name: string;
                email: string;
            } | null;
        }[];
    }>;
    updateExpense(userId: number, journalId: number, expenses: {
        type: string;
        amount: number;
        description?: string;
        userId?: number;
    }[]): Promise<{
        message: string;
        journalId: number;
    }>;
    deleteExpense(userId: number, journalId: number): Promise<{
        message: string;
        journalId: number;
    }>;
    getUsersForExpenses(): Promise<{
        id: number;
        email: string;
        expenseAccountId: number | null;
        name: string;
        isActive: boolean;
    }[]>;
}
