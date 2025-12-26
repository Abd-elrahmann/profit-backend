import { ExpenseService } from './expense.service';
export declare class ExpenseController {
    private readonly expenseService;
    constructor(expenseService: ExpenseService);
    createJournal(req: any, body: {
        expenses: {
            type: string;
            amount: number;
            description?: string;
            userId?: number;
        }[];
    }): Promise<{
        message: string;
        journalId: number;
    }>;
    getExpensesAccount(page: number, limit?: number): Promise<{
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
    getExpensesRecords(page: number, limit?: number): Promise<{
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
    updateExpense(req: any, journalId: number, body: {
        expenses: {
            type: string;
            amount: number;
            description?: string;
            userId?: number;
        }[];
    }): Promise<{
        message: string;
        journalId: number;
    }>;
    deleteExpense(req: any, journalId: number): Promise<{
        message: string;
        journalId: number;
    }>;
    getUsersForExpenses(): Promise<{
        id: number;
        name: string;
        isActive: boolean;
        email: string;
        expenseAccountId: number | null;
    }[]>;
}
