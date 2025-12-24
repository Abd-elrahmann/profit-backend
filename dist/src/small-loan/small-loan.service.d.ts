import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
export declare class SmallLoanService {
    private prisma;
    private journalService;
    constructor(prisma: PrismaService, journalService: JournalService);
    private toRiyadh;
    create(body: any, currentUser: number): Promise<{
        id: number;
        createdAt: Date;
        status: import("@prisma/client").$Enums.SmallLoanStatus;
        notes: string | null;
        amount: number;
        remaining: number;
        paidAmount: number;
        Name: string;
        closedAt: Date | null;
    }>;
    findAll(page?: number, limit?: number, status?: string, clientName?: string): Promise<{
        totalPages: number;
        page: number;
        limit: number;
        total: number;
        data: {
            createdAt: string | null;
            closedAt: string | null;
            id: number;
            status: import("@prisma/client").$Enums.SmallLoanStatus;
            notes: string | null;
            amount: number;
            remaining: number;
            paidAmount: number;
            Name: string;
        }[];
    }>;
    pay(id: number, body: any, currentUser: number): Promise<{
        message: string;
        loanId: number;
        paidNow: number;
        totalPaid: number;
        remaining: number;
        journalId: number;
    }>;
    delete(id: number, currentUser: number): Promise<{
        message: string;
    }>;
    update(id: number, body: any, currentUser: number): Promise<{
        message: string;
        loan: {
            id: number;
            createdAt: Date;
            status: import("@prisma/client").$Enums.SmallLoanStatus;
            notes: string | null;
            amount: number;
            remaining: number;
            paidAmount: number;
            Name: string;
            closedAt: Date | null;
        };
    }>;
}
