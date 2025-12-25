import { PrismaService } from '../prisma/prisma.service';
import { RepaymentDto } from './dto/repayment.dto';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
export declare class RepaymentService {
    private readonly prisma;
    private readonly journalService;
    private readonly notificationService;
    constructor(prisma: PrismaService, journalService: JournalService, notificationService: NotificationService);
    private updateClientStatus;
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
            source: import("@prisma/client").$Enums.LoanFundSource;
            startDate: Date;
            endDate: Date | null;
            repaymentDay: Date | null;
            bankAccountId: number | null;
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
    uploadReceipts(currentUser: any, id: number, files: Express.Multer.File[]): Promise<{
        message: string;
        fileUrls: string[];
    }>;
    approveRepayment(currentUser: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
        journalId: number;
    }>;
    rejectRepayment(currentUser: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
    }>;
    postponeRepayment(currentUser: any, id: number, dto: RepaymentDto): Promise<{
        message: string;
        repaymentId: number;
    }>;
    uploadPaymentProof(currentUser: any, id: number, file: Express.Multer.File): Promise<{
        message: string;
        fileUrl: string;
    }>;
    markAsPartialPaid(currentUser: number, id: number, paidAmount: number): Promise<{
        message: string;
        repaymentId: number;
        paidAmount: number;
        remaining: number;
        principalPart: number;
        interestPart: number;
    }>;
    markLoanAsEarlyPaid(loanId: number, earlyPaymentDiscount: number, currentUserId: number): Promise<{
        message: string;
        finalPayment: string;
        journalId: number;
    }>;
    approveMany(currentUser: number, ids: number[], dto: RepaymentDto): Promise<any>;
    rejectMany(currentUser: number, ids: number[], dto: RepaymentDto): Promise<any>;
    uploadPaymentProofBulk(currentUser: number, repaymentIds: number[], file: Express.Multer.File): Promise<{
        message: string;
        fileUrl: string;
        repaymentsCount: number;
    }>;
}
