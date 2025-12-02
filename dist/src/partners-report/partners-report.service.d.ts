import { PrismaService } from 'src/prisma/prisma.service';
export declare class PartnersReportService {
    private prisma;
    constructor(prisma: PrismaService);
    getAllPartners(page: number, limit?: number): Promise<{
        page: number;
        limit: number;
        totalPartners: number;
        data: {
            id: number;
            name: string;
            phone: string | null;
            nationalId: string;
            capitalAmount: number;
            totalProfit: number;
            totalAmount: number;
            accountBalance: number;
            loansCount: number;
            totalDeposits: number;
            totalWithdrawals: number;
            totalAccruedProfit: number;
            zakat: {
                required: number;
                paid: number;
                balance: number;
            };
        }[];
    }>;
    getPartnerDetails(id: number): Promise<{
        profile: {
            id: number;
            name: string;
            nationalId: string;
            phone: string | null;
            orgProfitPercent: number;
            capitalAmount: number;
            totalProfit: number;
            totalAmount: number;
            createdAt: Date;
        };
        loans: ({
            LoanPartnerShare: {
                id: number;
                isActive: boolean;
                partnerId: number;
                loanId: number;
                sharePercent: number;
            }[];
        } & {
            id: number;
            createdAt: Date;
            type: import("@prisma/client").$Enums.LoanType;
            status: import("@prisma/client").$Enums.LoanStatus;
            clientId: number;
            code: string;
            kafeelId: number | null;
            amount: number;
            interestRate: number;
            interestAmount: number;
            totalAmount: number;
            paymentAmount: number;
            durationMonths: number;
            startDate: Date;
            endDate: Date | null;
            repaymentDay: number | null;
            bankAccountId: number | null;
            partnerId: number | null;
            disbursementJournalId: number | null;
            settlementJournalId: number | null;
            DEBT_ACKNOWLEDGMENT: string | null;
            PROMISSORY_NOTE: string | null;
            SETTLEMENT: string | null;
            debtAcknowledgmentNumber: string | null;
            promissoryNoteNumber: string | null;
            earlyPaidAmount: number | null;
            earlyPaymentDiscount: number | null;
            newAmount: number | null;
        })[];
        transactions: {
            id: number;
            createdAt: Date;
            description: string | null;
            date: Date;
            reference: string | null;
            type: import("@prisma/client").$Enums.TransactionType;
            amount: number;
            partnerId: number;
            journalId: number | null;
        }[];
        periodProfits: ({
            savings: {
                id: number;
                createdAt: Date;
                periodId: number;
                partnerId: number;
                accrualId: number;
                savingAmount: import("@prisma/client/runtime/library").Decimal;
            }[];
        } & {
            id: number;
            periodId: number;
            partnerId: number;
            totalProfit: number;
        })[];
        summary: {
            loans: {
                totalLoans: number;
                activeLoans: number;
                completedLoans: number;
                totalLoanAmount: number;
            };
            transactions: {
                totalDeposits: number;
                totalWithdrawals: number;
            };
            profits: {
                totalRawShare: number;
                totalCompanyCut: number;
                totalPartnerProfit: number;
                distributedProfit: number;
                undistributedProfit: number;
            };
            savings: {
                totalSavings: number;
                periodsWithSavings: number;
            };
            periodProfits: {
                totalPeriodProfits: number;
                periodsCount: number;
            };
            zakat: {
                totalZakatAccrued: number;
                totalZakatPaid: number;
                zakatBalance: number;
            };
        };
    }>;
}
