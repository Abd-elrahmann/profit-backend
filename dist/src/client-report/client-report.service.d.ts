import { PrismaService } from '../prisma/prisma.service';
export declare class ClientReportService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAllClients(page: number, limit?: number): Promise<{
        page: number;
        limit: number;
        totalClients: number;
        data: {
            id: number;
            name: string;
            phone: string;
            note: string | null;
            loansCount: number;
            repaymentsCount: number;
            totalDebit: number;
            totalPaid: number;
            remaining: number;
        }[];
    }>;
    getClientDetails(clientId: number): Promise<{
        client: {
            id: number;
            name: string;
            phone: string;
            email: string | null;
            address: string;
            notes: string | null;
            status: import("@prisma/client").$Enums.ClientStatus;
            createdAt: Date;
        };
        totals: {
            totalRepayments: number;
            paidRepayments: number;
            pendingRepayments: number;
            overdueRepayments: number;
            totalDebit: number;
            totalPaid: number;
            remaining: number;
            totalDiscounts: number;
            totalPrincipalPaid: number;
            totalInterestPaid: number;
        };
        loans: {
            loanId: number;
            code: string;
            amount: number;
            interest: number;
            discount: number | null;
            totalAmount: number;
            paidAmount: number;
            remaining: number;
            paidCount: number;
            pendingCount: number;
            overdueCount: number;
            startDate: Date;
            endDate: Date | null;
            status: import("@prisma/client").$Enums.LoanStatus;
        }[];
    }>;
}
