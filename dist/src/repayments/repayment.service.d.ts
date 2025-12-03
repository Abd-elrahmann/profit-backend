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
                createdAt: Date;
                name: string;
                debit: number;
                credit: number;
                balance: number;
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
                notes: string | null;
            };
        } & {
            id: number;
            type: import("@prisma/client").$Enums.LoanType;
            status: import("@prisma/client").$Enums.LoanStatus;
            createdAt: Date;
            startDate: Date;
            endDate: Date | null;
            clientId: number;
            code: string;
            totalAmount: number;
            amount: number;
            partnerId: number | null;
            kafeelId: number | null;
            interestRate: number;
            interestAmount: number;
            paymentAmount: number;
            durationMonths: number;
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
            isClosed: boolean;
            partnerId: number;
            rawShare: number;
            companyCut: number;
            partnerFinal: number;
        }[];
    } & {
        id: number;
        status: import("@prisma/client").$Enums.PaymentStatus;
        createdAt: Date;
        clientId: number;
        notes: string | null;
        amount: number;
        count: number;
        interestAmount: number;
        loanId: number;
        dueDate: Date;
        remaining: number;
        paidAmount: number;
        principalAmount: number;
        paymentDate: Date | null;
        attachments: string[];
        PaymentProof: string | null;
        reviewStatus: string | null;
        postponeApproved: boolean | null;
        postponeReason: string | null;
        newDueDate: Date | null;
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
}
