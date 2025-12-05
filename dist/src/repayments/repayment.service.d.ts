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
                email: string | null;
                phone: string;
                name: string;
                createdAt: Date;
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
                debit: number;
                credit: number;
                balance: number;
                notes: string | null;
            };
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
