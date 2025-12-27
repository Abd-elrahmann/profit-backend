import { PrismaService } from '../prisma/prisma.service';
export declare class ClientReportService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAllClients(page: number, limit?: number, filters?: {
        status?: 'ACTIVE' | 'COMPLETE' | 'نشط' | 'منتهي';
    }): Promise<{
        page: number;
        limit: number;
        totalClients: number;
        data: {
            id: number;
            name: string;
            phone: string;
            address: string;
            note: string | null;
            createdAt: Date;
            loansSummary: {
                loansCount: number;
                activeLoans: number;
                completedLoans: number;
                overdueLoans: number;
            };
            repaymentSummary: {
                totalRepayments: number;
                paidRepayments: number;
                remainingRepayments: number;
            };
            financials: {
                totalDebit: number;
                totalPaid: number;
                remaining: number;
                totalDiscounts: number;
                totalInterestPaid: number;
                averageMonthlyInstallment: number;
            };
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
    updateClientNote(clientId: number, note: string): Promise<{
        success: boolean;
        message: string;
        client: {
            id: number;
            notes: string | null;
        };
    }>;
}
