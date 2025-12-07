import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class ExpenseService {
    private prisma;
    private readonly journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    createExpenseJournal(userId: number, amount: number, description: string): Promise<{
        message: string;
    }>;
    getExpensesAccountData(page?: number, limit?: number): Promise<{
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
}
