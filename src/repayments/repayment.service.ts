import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RepaymentDto } from './dto/repayment.dto';
import { PaymentStatus, JournalSourceType, TemplateType, LoanStatus, ClientStatus } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
import * as fs from 'fs';
import * as path from 'path';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class RepaymentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
        private readonly notificationService: NotificationService,
    ) { }

    private async updateClientStatus(clientId: number) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId },
            include: { repayments: true },
        });

        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' as any },
            });
            return;
        }

        const allRepayments = loans.flatMap(l => l.repayments);
        const overdue = allRepayments.filter(
            r => r.status === 'OVERDUE' || (r.status !== 'PAID' && r.dueDate < new Date()),
        );
        const unpaid = allRepayments.filter(r => r.status !== 'PAID');

        let newStatus: any = 'نشط';

        if (overdue.length > 0) {
            newStatus = 'متعثر';
        } else if (unpaid.length === 0) {
            newStatus = 'منتهي';
        }

        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }

    // Get all repayments for a specific loan
    async getRepaymentsByLoan(loanId: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { repayments: true, client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        // Convert repayment date fields to Saudi timezone
        const repaymentsWithSaudiTime = loan.repayments.map((repayment) => ({
            ...repayment,
            dueDate: repayment.dueDate
                ? DateTime.fromJSDate(repayment.dueDate)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            paymentDate: repayment.paymentDate
                ? DateTime.fromJSDate(repayment.paymentDate)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            newDueDate: repayment.newDueDate
                ? DateTime.fromJSDate(repayment.newDueDate)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            createdAt: repayment.createdAt
                ? DateTime.fromJSDate(repayment.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
        }));

        return repaymentsWithSaudiTime;
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
    async uploadReceipts(currentUser, id: number, files: Express.Multer.File[]) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!files || files.length === 0) throw new BadRequestException('No files uploaded');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadsDir = path.join(process.cwd(), 'uploads', 'clients', repayment.client?.nationalId || 'unknown', 'repayments');
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
            const filename = `${id}-${file.originalname}`;
            const filePath = path.join(uploadsDir, filename);
            fs.writeFileSync(filePath, file.buffer);

            const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
            const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
            fileUrls.push(publicUrl);
        }

        // Update repayment record
        await this.prisma.repayment.update({
            where: { id },
            data: {
                attachments: fileUrls,
                status: PaymentStatus.PENDING_REVIEW,
                reviewStatus: 'PENDING',
            },
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ايصالات للسداد للدفعة رقم ${id}`,
            },
        });

        return { message: 'Receipts uploaded successfully', fileUrls };
    }

    // Approve repayment
    async approveRepayment(currentUser, id: number, dto: RepaymentDto) {
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

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

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
                currentUser,
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

                const totalPaidAmount = await tx.repayment.aggregate({
                    where: { loanId: loan.id },
                    _sum: { paidAmount: true },
                }).then(res => res._sum.paidAmount || 0);

                await tx.loan.update({
                    where: { id: loan.id },
                    data: { 
                        status: 'COMPLETED',
                        endDate: new Date(),
                        newAmount: totalPaidAmount
                     },
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

            await this.updateClientStatus(loan.clientId);

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بالموافقة على السداد للدفعة رقم ${id}`,
                },
            });

            return {
                message: 'Repayment approved successfully',
                repaymentId: id,
                journalId: journal.journal.id,
            };
        });
    }

    // Reject repayment
    async rejectRepayment(currentUser, id: number, dto: RepaymentDto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status === LoanStatus.PENDING)
            throw new BadRequestException('loan is pending');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

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
            await this.updateClientStatus(loan.clientId);

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} برفض السداد للدفعة رقم ${id}`,
                },
            });

            return { message: 'Repayment rejected and journal removed', repaymentId: id };
        });
    }

    // Postpone repayment
    async postponeRepayment(currentUser, id: number, dto: RepaymentDto) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status === LoanStatus.PENDING || LoanStatus.COMPLETED)
            throw new BadRequestException('loan is not active');

        if (!dto.newDueDate)
            throw new BadRequestException('New due date is required for postponing');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

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

        await this.updateClientStatus(loan.clientId);

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتأجيل السداد للدفعة رقم ${id}`,
            },
        });

        return { message: 'Repayment postponed successfully', repaymentId: id };
    }

    // Upload payment proof
    async uploadPaymentProof(currentUser, id: number, file: Express.Multer.File) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { client: true },
        });

        if (!repayment) throw new NotFoundException('Repayment not found');
        if (!file) throw new BadRequestException('No file uploaded');

        const nationalId = repayment.client?.nationalId;
        if (!nationalId) throw new BadRequestException('Client national ID not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

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
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        // Update repayment record with PaymentProof URL
        await this.prisma.repayment.update({
            where: { id },
            data: { PaymentProof: publicUrl }
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل اثبات السداد للدفعة رقم ${id}`,
            },
        });

        return { message: 'Payment proof uploaded successfully', fileUrl: publicUrl };
    }

    // Update repayment as partial paid
    async markAsPartialPaid(currentUser, id: number, paidAmount: number) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: true }
        },
        );
        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;
        if (!loan) throw new NotFoundException('Loan not found');

        if (paidAmount <= 0)
            throw new BadRequestException('Paid amount must be greater than 0');

        if (paidAmount >= repayment.amount)
            throw new BadRequestException('Paid amount cannot be equal or greater than full amount — use approveRepayment instead');

        if (loan.status === LoanStatus.PENDING || LoanStatus.COMPLETED)
            throw new BadRequestException('loan is not active');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const newPaidAmount = paidAmount + (repayment.paidAmount || 0);

        if (newPaidAmount > repayment.amount)
            throw new BadRequestException('Paid amount must be equal or less than repayment amount');

        const remaining = repayment.amount - newPaidAmount;

        const updated = await this.prisma.repayment.update({
            where: { id },
            data: {
                paidAmount: newPaidAmount,
                remaining,
                status: remaining > 0 ? PaymentStatus.PARTIAL_PAID : PaymentStatus.COMPLETED,
                reviewStatus: 'APPROVED',
                paymentDate: new Date(),
            },
        });

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Repayments',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث السداد الجزئي للدفعة رقم ${id}`,
            },
        });

        return {
            message: 'Repayment marked as partial paid',
            repaymentId: updated.id,
            paidAmount: updated.paidAmount,
            remaining: updated.remaining,
            status: updated.status,
        };
    }

    // Mark loan as early paid
    async markLoanAsEarlyPaid(
        loanId: number,
        earlyPaymentDiscount: number,
        currentUserId: number,
    ) {
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                repayments: {
                    orderBy: { dueDate: 'asc' },
                },
                client: true,
            },
        });

        if (!loan) throw new NotFoundException('Loan not found');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUserId },
        });

        // Step 1: Calculate totals
        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;
        let totalAlreadyPaid = 0;

        loan.repayments.forEach(rep => {
            const remainingPrincipal = rep.principalAmount - rep.paidAmount;
            const paidInterest = Math.max(rep.paidAmount - rep.principalAmount, 0);
            const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

            totalRemainingPrincipal += Math.max(remainingPrincipal, 0);
            totalRemainingInterest += Math.max(remainingInterest, 0);
            totalAlreadyPaid += rep.paidAmount || 0;
        });

        // Step 2: Validate discount
        if (earlyPaymentDiscount >= totalRemainingInterest) {
            throw new BadRequestException(
                `Discount cannot exceed remaining interest (${totalRemainingInterest})`,
            );
        }

        // Step 3: Compute totals
        const totalDue = totalRemainingPrincipal + totalRemainingInterest;
        const finalPayment = totalDue - earlyPaymentDiscount;
        const totalPaidIncludingPartial = totalAlreadyPaid + finalPayment;
        const equalPaymentPerInstallment = totalPaidIncludingPartial / loan.repayments.length;

        // Step 4: Distribute the discount across interest portions proportionally
        const discountRatio = earlyPaymentDiscount / totalRemainingInterest;

        // Get accounts
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
            // Step 5: Create journal entry (bank debit = totalPaidIncludingPartial)
            const journal = await this.journalService.createJournal(
                {
                    reference: `EARLY-${loan.id}`,
                    description: `Early payment for Loan ${loan.code} with interest discount ${earlyPaymentDiscount}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.LOAN,
                    sourceId: loan.id,
                    lines: [
                        {
                            accountId: bankAccount.id,
                            debit: totalPaidIncludingPartial,
                            credit: 0,
                            description: `استلام سداد مبكر من العميل ${loan.client.name}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: totalPaidIncludingPartial - (totalRemainingInterest - earlyPaymentDiscount),
                            description: 'سداد أصل السلفة بالكامل',
                            clientId: loan.client.id,
                        },
                        {
                            accountId: loanIncome.id,
                            debit: 0,
                            credit: totalRemainingInterest - earlyPaymentDiscount,
                            description: 'دخل الفائدة بعد خصم السداد المبكر',
                        },
                    ],
                },
                currentUserId,
            );

            // Step 6: Update repayments equally but adjust interest discount proportionally
            for (const rep of loan.repayments) {
                const paidInterest = Math.max(rep.paidAmount - rep.principalAmount, 0);
                const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

                // Apply proportional discount to this installment's remaining interest
                const interestDiscount = remainingInterest * discountRatio;

                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        status: 'EARLY_PAID',
                        paidAmount: equalPaymentPerInstallment,
                        remaining: 0,
                        paymentDate: new Date(),
                        reviewStatus: 'APPROVED',
                        notes: `Early paid with proportional interest discount of ${interestDiscount.toFixed(2)}`,
                    },
                });
            }

            const totalPaidAmount = await tx.repayment.aggregate({
                where: { loanId: loan.id },
                _sum: { paidAmount: true },
            }).then(res => res._sum.paidAmount || 0);

            // Step 7: Update loan
            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    status: 'COMPLETED',
                    earlyPaidAmount: totalDue,
                    earlyPaymentDiscount,
                    endDate: new Date(),
                    settlementJournalId: journal.journal.id,
                    newAmount: totalPaidAmount
                },
            });

            // Step 8: Log action
            await tx.auditLog.create({
                data: {
                    userId: currentUserId,
                    screen: 'Loans',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بتسديد السلفة رقم ${loan.code} مبكرًا بخصم ${earlyPaymentDiscount} على الفائدة.`,
                },
            });

            return {
                message: 'Loan marked as early paid successfully',
                totalRemainingPrincipal,
                totalRemainingInterest,
                totalDue,
                finalPayment,
                earlyPaymentDiscount,
                totalPaidIncludingPartial,
                equalPaymentPerInstallment,
                journalId: journal.journal.id,
            };
        });
    }
}