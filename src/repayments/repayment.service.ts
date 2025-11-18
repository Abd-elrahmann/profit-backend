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

    // Get specific repayment by ID
    async getRepaymentById(id: number) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: {
                loan: {
                    include: {
                        client: true,
                    }
                },
                profitAccruals: {
                    select: {
                        partnerId: true,
                        rawShare: true,
                        companyCut: true,
                        partnerFinal: true,
                        isClosed: true,
                    }
                },
            }
        }
        );

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
        const interestAmount = repayment.interestAmount;
        const principalAmount = repayment.principalAmount;

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
                    remaining: 0,
                },
            });

            const partnerShares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
                include: { partner: true }
            });

            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;

            for (const ps of partnerShares) {

                const sharePercent = Number(ps.sharePercent || 0);
                const orgCutPercent = Number(ps.partner.orgProfitPercent || 0);
                const rawShare = Number(((interestAmount * sharePercent) / 100).toFixed(2));
                const companyCut = Number(((rawShare * orgCutPercent) / 100).toFixed(2));
                const partnerFinal = rawShare - companyCut;

                await tx.partnerShareAccrual.create({
                    data: {
                        periodId: periodId,
                        loanId: loan.id,
                        repaymentId: repayment.id,
                        partnerId: ps.partnerId,
                        rawShare,
                        companyCut,
                        partnerFinal,
                    },
                });
            }

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

            await tx.partnerShareAccrual.deleteMany({
                where: { repaymentId: repayment.id },
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

    // Mark repayment as partial paid
    async markAsPartialPaid(currentUser: number, id: number, paidAmount: number) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id },
            include: { loan: { include: { client: true } } },
        });

        if (!repayment) throw new NotFoundException('Repayment not found');

        const loan = repayment.loan;

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status === LoanStatus.PENDING || loan.status === LoanStatus.COMPLETED)
            throw new BadRequestException('Loan is not active');

        if (paidAmount <= 0)
            throw new BadRequestException('Paid amount must be greater than 0');

        const currentPaid = repayment.paidAmount || 0;
        const newPaidAmount = currentPaid + paidAmount;

        if (newPaidAmount > repayment.amount)
            throw new BadRequestException(
                `Paid amount exceeds installment amount. Max allowed: ${repayment.amount - currentPaid}`
            );

        const remaining = parseFloat((repayment.amount - newPaidAmount).toFixed(2));

        // Accounting accounts
        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!bankAccount || !loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounting accounts');

        return await this.prisma.$transaction(async tx => {

            // Determine how much of this payment is Principal vs Interest
            const totalPrincipal = repayment.principalAmount;
            const totalInterest = repayment.amount - repayment.principalAmount;

            const alreadyPaidInterest = Math.max(currentPaid - totalPrincipal, 0);
            const remainingInterest = totalInterest - alreadyPaidInterest;

            let principalPart = 0;
            let interestPart = 0;

            // 1st: always cover remaining principal first
            if (currentPaid < totalPrincipal) {
                const remainingPrincipal = totalPrincipal - currentPaid;

                if (paidAmount <= remainingPrincipal) {
                    principalPart = paidAmount;
                } else {
                    principalPart = remainingPrincipal;
                    interestPart = paidAmount - remainingPrincipal;
                }
            } else {
                interestPart = paidAmount;
            }

            // Create Journal Entry for this partial payment
            await this.journalService.createJournal(
                {
                    reference: `PARTIAL-${repayment.id}-${Date.now()}`,
                    description: `Partial payment for repayment #${repayment.id}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                    lines: [
                        {
                            accountId: bankAccount.id,
                            debit: paidAmount,
                            credit: 0,
                            description: `Partial repayment received from ${loan.client.name}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: principalPart,
                            description: 'Partial principal repayment',
                            clientId: loan.client.id,
                        },
                        {
                            accountId: loanIncome.id,
                            debit: 0,
                            credit: interestPart,
                            description: 'Interest portion of partial payment',
                        },
                    ],
                },
                currentUser
            );

            // Update repayment record
            const updated = await tx.repayment.update({
                where: { id },
                data: {
                    paidAmount: newPaidAmount,
                    remaining,
                    status: remaining > 0 ? PaymentStatus.PARTIAL_PAID : PaymentStatus.PAID,
                    reviewStatus: 'APPROVED',
                    paymentDate: new Date(),
                },
            });

            // Create partner share accrual for this partial payment
            const loanPartners = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id, isActive: true },
                include: { partner: true }
            });

            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;

            for (const partner of loanPartners) {
                const partnerPercentage = partner.sharePercent / 100;

                // نصيب المساهم من الفائدة فقط
                const rawShare = parseFloat((interestPart * partnerPercentage).toFixed(2));

                // الشركة تأخذ نسبة من نصيبهم
                const companyCut = parseFloat((rawShare * (partner.partner.orgProfitPercent / 100)).toFixed(2));

                const partnerFinal = parseFloat((rawShare - companyCut).toFixed(2));

                await tx.partnerShareAccrual.create({
                    data: {
                        periodId: periodId,
                        partnerId: partner.partnerId,
                        loanId: loan.id,
                        repaymentId: repayment.id,
                        rawShare,
                        companyCut,
                        partnerFinal,
                        isClosed: false,
                    }
                });
            }

            // Audit Log
            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'UPDATE',
                    description: `قام المستخدم بعمل سداد جزئي للدفعة رقم ${id} بمبلغ ${paidAmount}`,
                },
            });

            return {
                message: 'Partial payment recorded successfully',
                repaymentId: id,
                paidAmount: newPaidAmount,
                remaining,
                principalPart,
                interestPart,
            };
        });
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
                repayments: { orderBy: { dueDate: 'asc' } },
                client: true,
            },
        });

        if (!loan) throw new NotFoundException('Loan not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUserId } });

        // Step 1: Filter unpaid or partially paid repayments
        const unpaidRepayments = loan.repayments.filter(
            r => r.status !== 'PAID' && r.status !== 'EARLY_PAID'
        );

        if (unpaidRepayments.length === 0)
            throw new BadRequestException('No unpaid repayments to process.');

        // Step 2: Calculate totals for unpaid repayments
        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;

        unpaidRepayments.forEach(rep => {
            const remainingPrincipal = rep.principalAmount - (rep.paidAmount || 0);
            const paidInterest = Math.max((rep.paidAmount || 0) - rep.principalAmount, 0);
            const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

            totalRemainingPrincipal += Math.max(remainingPrincipal, 0);
            totalRemainingInterest += Math.max(remainingInterest, 0);
        });

        // Step 3: Validate discount
        if (earlyPaymentDiscount > totalRemainingInterest) {
            throw new BadRequestException(
                `Discount cannot exceed remaining interest (${totalRemainingInterest.toFixed(2)})`,
            );
        }

        const finalPayment = totalRemainingPrincipal + (totalRemainingInterest - earlyPaymentDiscount);

        // Step 4: Get accounts
        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!bankAccount || !loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        return await this.prisma.$transaction(async (tx) => {
            // Step 5: Create journal entry
            const journal = await this.journalService.createJournal(
                {
                    reference: `EARLY-${loan.id}`,
                    description: `Early payment for Loan ${loan.code} with interest discount ${earlyPaymentDiscount}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.LOAN,
                    sourceId: loan.id,
                    lines: [
                        { accountId: bankAccount.id, debit: finalPayment, credit: 0, description: `استلام سداد مبكر من العميل ${loan.client.name}` },
                        { accountId: loansReceivable.id, debit: 0, credit: totalRemainingPrincipal, description: 'سداد أصل السلفة بالكامل', clientId: loan.client.id },
                        { accountId: loanIncome.id, debit: 0, credit: totalRemainingInterest - earlyPaymentDiscount, description: 'دخل الفائدة بعد خصم السداد المبكر' },
                    ],
                },
                currentUserId
            );

            // Step 6: Update repayments
            const discountRatio = earlyPaymentDiscount / totalRemainingInterest;
            let interestDistributed = 0;

            for (const [index, rep] of unpaidRepayments.entries()) {
                const alreadyPaid = rep.paidAmount || 0;
                const remainingPrincipal = rep.principalAmount - alreadyPaid;
                const paidInterest = Math.max(alreadyPaid - rep.principalAmount, 0);
                const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

                // Calculate interest discount for this installment
                let interestDiscount = parseFloat((remainingInterest * discountRatio).toFixed(2));
                let interestPortion = parseFloat((remainingInterest - interestDiscount).toFixed(2));

                // For the last repayment, adjust to ensure total sums exactly
                if (index === unpaidRepayments.length - 1) {
                    interestPortion = parseFloat((totalRemainingInterest - earlyPaymentDiscount - interestDistributed).toFixed(2));
                    interestDiscount = remainingInterest - interestPortion;
                } else {
                    interestDistributed += interestPortion;
                }

                const newPaidAmount = parseFloat((remainingPrincipal + interestPortion + alreadyPaid).toFixed(2));

                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        status: 'EARLY_PAID',
                        paidAmount: newPaidAmount,
                        interestAmount: interestPortion,
                        remaining: 0,
                        paymentDate: new Date(),
                        reviewStatus: 'APPROVED',
                        notes: `تم السداد المبكر مع خصم الفائدة ${interestDiscount.toFixed(2)}`,
                    },
                });
            }

            // Step 7: Partner Share Accrual
            const partnerShares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
                include: { partner: true },
            });

            const realizedInterest = totalRemainingInterest - earlyPaymentDiscount;

            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new BadRequestException('No open period found. Please create a period first.');
            }
            const periodId = currentPeriod.id;

            if (realizedInterest > 0) {
                for (const ps of partnerShares) {
                    const sharePercent = Number(ps.sharePercent || 0);
                    const orgCutPercent = Number(ps.partner.orgProfitPercent || 0);

                    const rawShare = Number(((realizedInterest * sharePercent) / 100).toFixed(2));
                    const companyCut = Number(((rawShare * orgCutPercent) / 100).toFixed(2));
                    const partnerFinal = rawShare - companyCut;

                    await tx.partnerShareAccrual.create({
                        data: { periodId: periodId, loanId: loan.id, repaymentId: null, partnerId: ps.partnerId, rawShare, companyCut, partnerFinal },
                    });
                }
            }

            // Step 8: Update loan
            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    status: 'COMPLETED',
                    earlyPaidAmount: totalRemainingPrincipal + totalRemainingInterest,
                    earlyPaymentDiscount,
                    endDate: new Date(),
                    settlementJournalId: journal.journal.id,
                    newAmount: loan.repayments.reduce((sum, r) => sum + (r.paidAmount || 0), 0),
                },
            });

            // Step 9: Audit log
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
                finalPayment: finalPayment.toFixed(2),
                journalId: journal.journal.id,
            };
        });
    }
}