import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RepaymentDto } from './dto/repayment.dto';
import { PaymentStatus, JournalSourceType, TemplateType, LoanStatus } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RepaymentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
        private readonly notificationService: NotificationService,
    ) { }

    // Get all repayments for a specific loan
    async getRepaymentsByLoan(loanId: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { repayments: true, client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        return loan.repayments;
    }

    // Get specific repayment by ID
    async getRepaymentById(id: number) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: {
                loan: {
                    include: {
                        client: true
                    }
                }
            }
        });
        if (!repayment) throw new NotFoundException('Repayment not found');
        return repayment;
    }

    // Upload multiple receipts for a repayment
    async uploadReceipts(id: number, files: Express.Multer.File[]) {
        const repayment = await this.prisma.repayment.findUnique({ where: { id } });
        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!files || files.length === 0) throw new BadRequestException('No files uploaded');

        const uploadsDir = path.join(process.cwd(), 'uploads', 'repayments');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        // Delete old files if exist (optional)
        if (Array.isArray(repayment.attachments)) {
            for (const fileUrl of repayment.attachments) {
                try {
                    const urlPath = new URL(fileUrl).pathname;
                    const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                    if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
                } catch { }
            }
        } else if (typeof repayment.attachments === 'string') {
            try {
                const urlPath = new URL(repayment.attachments).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
            } catch { }
        }

        // Save all new files
        const fileUrls: string[] = [];

        for (const file of files) {
            const filename = `${id}-${Date.now()}-${file.originalname}`;
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, file.buffer);

            const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
            const publicUrl = `http://localhost:3000/${encodeURI(relPath)}`;
            fileUrls.push(publicUrl);
        }

        // Update repayment record
        await this.prisma.repayment.update({
            where: { id },
            data: {
                attachments: fileUrls, // array of URLs
                status: PaymentStatus.PENDING,
                reviewStatus: 'PENDING',
            },
        });

        return { message: 'Receipts uploaded successfully', fileUrls };
    }

    // Approve repayment
    async approveRepayment(id: number, dto: RepaymentDto, userId?: number) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status === LoanStatus.PENDING)
            throw new BadRequestException('loan is pending');

        if (repayment.status === PaymentStatus.PAID)
            throw new BadRequestException('Repayment already approved');

        const totalAmount = dto.paidAmount ?? repayment.amount;
        const interestAmount = loan.interestAmount / loan.durationMonths;
        const principalAmount = totalAmount - interestAmount;

        const bankAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });
        const loansReceivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const loanIncome = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOAN_INCOME' },
        });

        if (!bankAccount || !loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        return await this.prisma.$transaction(async (tx) => {
            // Create Journal Entry using journalService
            const journal = await this.journalService.createJournal(
                {
                    reference: `REP-${repayment.id}`,
                    description: `Repayment approval for loan #${loan.code}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                    lines: [
                        {
                            accountId: bankAccount.id,
                            debit: totalAmount,
                            credit: 0,
                            description: `Repayment received from ${loan.client.name}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: principalAmount,
                            description: 'Loan principal repayment',
                            clientId: loan.client.id,
                        },
                        {
                            accountId: loanIncome.id,
                            debit: 0,
                            credit: interestAmount,
                            description: 'Loan interest income',
                        },
                    ],
                },
                userId,
            );

            const updatedRepayment = await tx.repayment.update({
                where: { id },
                data: {
                    paidAmount: totalAmount,
                    status: PaymentStatus.PAID,
                    paymentDate: new Date(),
                    notes: dto.notes,
                    reviewStatus: 'APPROVED',
                },
            });

            const remaining = await tx.repayment.count({
                where: { loanId: loan.id, status: { not: PaymentStatus.PAID } },
            });

            if (remaining === 0) {
                await tx.loan.update({
                    where: { id: loan.id },
                    data: { status: 'COMPLETED' },
                });
            }

            // Send notification via WhatsApp
            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_APPROVED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'WHATSAPP',
                });
            } catch (error) {
                console.error('❌ Failed to send WhatsApp notification:', error.message);
            }

            // Send notification via Telegram
            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_APPROVED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'TELEGRAM',
                });
            } catch (error) {
                console.error('❌ Failed to send Telegram notification:', error.message);
            }

            return {
                message: 'Repayment approved successfully',
                repaymentId: id,
                journalId: journal.journal.id,
            };
        });
    }

    // Reject repayment
    async rejectRepayment(id: number, dto: RepaymentDto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status === LoanStatus.PENDING)
            throw new BadRequestException('loan is pending');

        // Start transaction to keep data consistent
        return await this.prisma.$transaction(async (tx) => {
            // Find any journal created for this repayment
            const journal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                },
                include: { lines: true },
            });

            if (journal) {
                await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
                await tx.journalHeader.delete({ where: { id: journal.id } });
            }

            // Reset repayment fields
            const updatedRepayment = await tx.repayment.update({
                where: { id },
                data: {
                    status: PaymentStatus.PENDING,
                    paidAmount: 0,
                    paymentDate: null,
                    reviewStatus: 'REJECTED',
                    notes: dto.notes,
                    attachments: [],
                    PaymentProof: null,
                },
            });

            // Send notification via WhatsApp
            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_REJECTED,
                    clientId: repayment.loan.clientId,
                    loanId: repayment.loan.id,
                    repaymentId: repayment.id,
                    channel: 'WHATSAPP',
                });
            } catch (error) {
                console.error('❌ Failed to send WhatsApp notification:', error.message);
            }

            // Send notification via Telegram
            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_REJECTED,
                    clientId: repayment.loan.clientId,
                    loanId: repayment.loan.id,
                    repaymentId: repayment.id,
                    channel: 'TELEGRAM',
                });
            } catch (error) {
                console.error('❌ Failed to send Telegram notification:', error.message);
            }

            return { message: 'Repayment rejected and journal removed', repaymentId: id };
        });
    }

    // Postpone repayment
    async postponeRepayment(id: number, dto: RepaymentDto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status === LoanStatus.PENDING)
            throw new BadRequestException('loan is pending');

        if (!dto.newDueDate)
            throw new BadRequestException('New due date is required for postponing');

        await this.prisma.repayment.update({
            where: { id },
            data: {
                postponeApproved: true,
                postponeReason: dto.postponeReason ?? 'Delay approved by management',
                newDueDate: new Date(dto.newDueDate),
                dueDate: new Date(dto.newDueDate),
                status: PaymentStatus.PENDING,
                reviewStatus: 'POSTPONED',
            },
        });

        return { message: 'Repayment postponed successfully', repaymentId: id };
    }

    // Upload payment proof
    async uploadPaymentProof(id: number, file: Express.Multer.File) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });

        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!file) throw new BadRequestException('No file uploaded');

        const clientId = repayment.clientId;
        const nationalId = repayment.client?.nationalId;
        if (!nationalId) throw new BadRequestException('Client national ID not found');

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = `${id}-اثبات-السداد${path.extname(file.originalname)}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);

        const prevFileUrl = typeof repayment.PaymentProof === 'string' ? repayment.PaymentProof : undefined;
        if (prevFileUrl) {
            try {
                const urlPath = new URL(prevFileUrl).pathname;
                const prevLocal = path.join(process.cwd(), urlPath.replace(/^\//, ''));
                if (fs.existsSync(prevLocal)) fs.unlinkSync(prevLocal);
            } catch {
            }
        }

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `http://localhost:3000/${encodeURI(relPath)}`;

        // Update repayment record with PaymentProof URL
        await this.prisma.repayment.update({
            where: { id },
            data: { PaymentProof: publicUrl }
        });

        return { message: 'Payment proof uploaded successfully', fileUrl: publicUrl };
    }
}