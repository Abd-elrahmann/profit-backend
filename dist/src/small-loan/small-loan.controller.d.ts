import { SmallLoanService } from './small-loan.service';
export declare class SmallLoanController {
    private readonly service;
    constructor(service: SmallLoanService);
    create(req: any, body: any): Promise<{
        id: number;
        status: import("@prisma/client").$Enums.SmallLoanStatus;
        createdAt: Date;
        notes: string | null;
        amount: number;
        remaining: number;
        paidAmount: number;
        Name: string;
        closedAt: Date | null;
    }>;
    findAll(page: number, status?: string, limit?: number, clientName?: string): Promise<{
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
    pay(req: any, id: number, body: any): Promise<{
        message: string;
        loanId: number;
        paidNow: number;
        totalPaid: number;
        remaining: number;
        journalId: number;
    }>;
    delete(req: any, id: number): Promise<{
        message: string;
    }>;
    updateLoan(req: any, id: number, body: {
        Name?: string;
        amount?: number;
        notes?: string;
    }): Promise<{
        message: string;
        loan: {
            id: number;
            status: import("@prisma/client").$Enums.SmallLoanStatus;
            createdAt: Date;
            notes: string | null;
            amount: number;
            remaining: number;
            paidAmount: number;
            Name: string;
            closedAt: Date | null;
        };
    }>;
}
