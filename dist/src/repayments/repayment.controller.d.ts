import { RepaymentService } from './repayment.service';
import { RepaymentDto } from './dto/repayment.dto';
export declare class RepaymentController {
    private readonly repaymentService;
    constructor(repaymentService: RepaymentService);
    getRepaymentById(id: number): Promise<{
        loan: {
            client: {
                id: number;
                status: import("@prisma/client").$Enums.ClientStatus;
                notes: string | null;
                createdAt: Date;
                name: string;
                email: string | null;
                phone: string;
                telegramChatId: string | null;
                birthDate: Date;
                address: string;
                nationalId: string;
                city: string;
                district: string;
                employer: string;
                salary: number;
                obligations: number;
                creationReason: string;
                debit: number;
                credit: number;
                balance: number;
            };
        } & {
            id: number;
            clientId: number;
            amount: number;
            interestAmount: number;
            status: import("@prisma/client").$Enums.LoanStatus;
            createdAt: Date;
            partnerId: number | null;
            code: string;
            kafeelId: number | null;
            interestRate: number;
            totalAmount: number;
            paymentAmount: number;
            durationMonths: number;
            type: import("@prisma/client").$Enums.LoanType;
            startDate: Date;
            endDate: Date | null;
            repaymentDay: number | null;
            bankAccountId: number | null;
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
        };
        profitAccruals: {
            partnerId: number;
            rawShare: number;
            companyCut: number;
            partnerFinal: number;
            isClosed: boolean;
        }[];
    } & {
        id: number;
        count: number;
        loanId: number;
        clientId: number;
        dueDate: Date;
        amount: number;
        remaining: number;
        paidAmount: number;
        principalAmount: number;
        interestAmount: number;
        status: import("@prisma/client").$Enums.PaymentStatus;
        paymentDate: Date | null;
        attachments: string[];
        PaymentProof: string | null;
        reviewStatus: string | null;
        notes: string | null;
        postponeApproved: boolean | null;
        postponeReason: string | null;
        newDueDate: Date | null;
        createdAt: Date;
    }>;
    uploadReceipts(req: any, id: number, files: Express.Multer.File[]): Promise<{
        message: string;
        fileUrls: string[];
    }>;
    approveRepayment(req: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
        journalId: number;
    }>;
    rejectRepayment(req: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
    }>;
    postponeRepayment(req: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
    }>;
    uploadPaymentProof(req: any, id: number, file: Express.Multer.File): Promise<{
        message: string;
        fileUrl: string;
    }>;
    markAsPartialPaid(req: any, id: string, paidAmount: number): Promise<{
        message: string;
        repaymentId: number;
        paidAmount: number;
        remaining: number;
        principalPart: number;
        interestPart: number;
    }>;
    markAsEarlyPaid(req: any, id: number, earlyPaymentDiscount: number): Promise<{
        message: string;
        finalPayment: string;
        journalId: number;
    }>;
    approveMany(req: any, body: {
        ids: number[];
        notes?: string;
    }): Promise<any>;
    rejectMany(req: any, body: {
        ids: number[];
        notes?: string;
    }): Promise<any>;
}
