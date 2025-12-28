import { RepaymentService } from './repayment.service';
import { RepaymentDto } from './dto/repayment.dto';
export declare class RepaymentController {
    private readonly repaymentService;
    constructor(repaymentService: RepaymentService);
    getRepaymentById(id: number): Promise<{
        loan: {
            client: {
                id: number;
                email: string | null;
                phone: string;
                name: string;
                createdAt: Date;
                credit: number;
                debit: number;
                balance: number;
                status: import("@prisma/client").$Enums.ClientStatus;
                nationalId: string;
                birthDate: Date;
                city: string;
                district: string;
                employer: string;
                salary: number;
                obligations: number;
                telegramChatId: string | null;
                address: string;
                creationReason: string;
                notes: string | null;
            };
        } & {
            id: number;
            createdAt: Date;
            code: string;
            type: import("@prisma/client").$Enums.LoanType;
            status: import("@prisma/client").$Enums.LoanStatus;
            clientId: number;
            kafeelId: number | null;
            amount: number;
            interestRate: number;
            interestAmount: number;
            totalAmount: number;
            paymentAmount: number;
            durationMonths: number;
            source: import("@prisma/client").$Enums.LoanFundSource;
            startDate: Date;
            endDate: Date | null;
            repaymentDay: Date | null;
            bankAccountId: number | null;
            partnerId: number | null;
            disbursementJournalId: number | null;
            settlementJournalId: number | null;
            DEBT_ACKNOWLEDGMENT: string | null;
            PROMISSORY_NOTE: string | null;
            SETTLEMENT: string | null;
            PAYMENT_PROOF: string[];
            debtAcknowledgmentNumber: string | null;
            promissoryNoteNumber: string | null;
            earlyPaidAmount: number | null;
            earlyPaymentDiscount: number | null;
            newAmount: number | null;
        };
        profitAccruals: {
            partnerId: number;
            isClosed: boolean;
            rawShare: number;
            companyCut: number;
            partnerFinal: number;
        }[];
    } & {
        id: number;
        createdAt: Date;
        attachments: string[];
        status: import("@prisma/client").$Enums.PaymentStatus;
        notes: string | null;
        clientId: number;
        amount: number;
        interestAmount: number;
        count: number;
        loanId: number;
        dueDate: Date;
        remaining: number;
        paidAmount: number;
        principalAmount: number;
        paymentDate: Date | null;
        PaymentProof: string | null;
        reviewStatus: string | null;
        postponeApproved: boolean | null;
        postponeReason: string | null;
        newDueDate: Date | null;
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
    uploadPaymentProofBulk(req: any, file: Express.Multer.File, repaymentIds: number[]): Promise<{
        message: string;
        fileUrl: string;
        repaymentsCount: number;
    }>;
}
