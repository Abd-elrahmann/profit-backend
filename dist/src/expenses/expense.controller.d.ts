import { ExpenseService } from './expense.service';
export declare class ExpenseController {
    private readonly expenseService;
    constructor(expenseService: ExpenseService);
    createJournal(req: any, body: {
        amount: number;
        description: string;
    }): Promise<{
        message: string;
    }>;
    getExpensesAccount(page: number, limit?: number): Promise<{
        total: number;
        page: number;
        limit: number;
        account: {
            id: number;
            code: string;
            name: string;
            totalDebit: number;
            totalCredit: number;
            balance: number;
        };
        journals: {
            journalId: number;
            journalReference: string | null;
            description: string | null;
            debit: number;
            credit: number;
            date: Date;
        }[];
    }>;
    updateExpense(req: any, journalId: number, body: {
        amount: number;
        description: string;
    }): Promise<{
        message: string;
        journalId: number;
    }>;
    deleteExpense(req: any, journalId: number): Promise<{
        message: string;
        journalId: number;
    }>;
}
