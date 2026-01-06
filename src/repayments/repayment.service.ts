import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RepaymentDto } from './dto/repayment.dto';
import { PaymentStatus, JournalSourceType, TemplateType, LoanStatus, ClientStatus, LoanFundSource } from '@prisma/client';
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
            where: {
                clientId,
                status: 'ACTIVE'
            },
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
            r => r.status === 'OVERDUE' || (r.status == 'PENDING' && r.dueDate < new Date()),
        );
        const unpaid = allRepayments.filter(r => r.status == 'PENDING');

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

        return { message: 'تم رفع الايصال بنجاح', fileUrls };
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
            throw new BadRequestException('السلفة قيد الانتظار');

        if (repayment.status === PaymentStatus.PAID)
            throw new BadRequestException('الدفعة مدفوعة بالفعل');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const roundToTwo = (num) => Math.round(num * 100) / 100;

        const totalAmount = roundToTwo(dto.paidAmount ?? repayment.amount);
        const interestAmount = roundToTwo(repayment.interestAmount);
        const principalAmount = roundToTwo(repayment.principalAmount);

        const discount = dto.discount ? roundToTwo(dto.discount) : 0;
        if (discount > interestAmount) {
            throw new BadRequestException(
                `الخصم لا يمكن أن يتجاوز الفائدة  (${interestAmount})`
            );
        }

        const total = roundToTwo(totalAmount - discount);

        const netInterest = roundToTwo(interestAmount - discount);

        const loansReceivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const loanIncome = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOAN_INCOME' },
        });

        if (!loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        const creditAccount = await this.prisma.account.findFirstOrThrow({
            where: { accountBasicType: 'BANK' },
        });

        await this.prisma.$transaction(async (tx) => {
            // Create Journal Entry using journalService
            const journal = await this.journalService.createJournal(
                {
                    reference: `REP-${repayment.id}`,
                    description: `الموافقة على سداد دفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                    lines: [
                        {
                            accountId: creditAccount.id,
                            debit: total,
                            credit: 0,
                            description: `استلام سداد دفعة للسلفة رقم ${loan.id}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: principalAmount,
                            description: 'سداد اصل السلفة',
                            clientId: loan.client.id,
                        },
                        {
                            accountId: loanIncome.id,
                            debit: 0,
                            credit: netInterest,
                            description: 'دخل فوائد السلفة',
                            clientId: loan.client.id,
                        },
                        { accountId: loansReceivable.id, debit: discount, credit: 0, description: 'خصم' },
                        { accountId: loansReceivable.id, debit: 0, credit: discount, description: 'خصم', clientId: loan.client.id },
                    ],
                },
                currentUser,
            );

            await this.journalService.postJournal(journal.journal.id, currentUser);

            await tx.repayment.update({
                where: { id },
                data: {
                    paidAmount: total,
                    status: PaymentStatus.PAID,
                    paymentDate: new Date(),
                    notes: dto.notes,
                    reviewStatus: 'APPROVED',
                    remaining: 0,
                    interestAmount: netInterest,
                },
            });

            let partnerShares: any[] = [];
            if (loan.source === LoanFundSource.GENERAL) {
                partnerShares = await tx.loanPartnerShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            } else if (loan.source === LoanFundSource.NEW_CAPITAL) {
                partnerShares = await tx.loanNewCapitalShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }

            const partnerAccruals = await tx.partnerShareAccrual.findMany({ where: { loanId: loan.id } });

            const realizedInterest = loan.interestAmount - discount;

            if (realizedInterest > 0) {
                for (const ps of partnerShares) {
                    const sharePercent =
                        loan.source === LoanFundSource.GENERAL
                            ? Number(ps.sharePercent || 0)
                            : Number(ps.percent || 0);

                    const existingAccrual = partnerAccruals.find(acc => acc.partnerId === ps.partnerId);

                    let oldcut = 0;
                    if (existingAccrual && existingAccrual.rawShare > 0) {
                        oldcut = Number(((existingAccrual.companyCut / existingAccrual.rawShare) * 100).toFixed(2));
                    }

                    const rawShare = Number(((realizedInterest * sharePercent) / 100).toFixed(2));
                    const companyCut = Number(((rawShare * oldcut) / 100).toFixed(2));
                    const partnerFinal = Number((rawShare - companyCut).toFixed(2));

                    const oldPartnerFinal = Number(existingAccrual?.partnerFinal || 0);
                    const ratio = Number((oldPartnerFinal - partnerFinal).toFixed(2));

                    if (rawShare === 0 && companyCut === 0) continue;

                    if (existingAccrual) {
                        await tx.partnerShareAccrual.update({
                            where: { id: existingAccrual.id },
                            data: { rawShare, companyCut, partnerFinal },
                        });

                        await tx.partner.update({
                            where: { id: existingAccrual.partnerId },
                            data: { upcomingProfit: { decrement: ratio } },
                        });
                    }
                }
            }

            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    newAmount: loan.newAmount ? loan.newAmount - discount : loan.totalAmount - discount,
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

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بالموافقة على السداد للدفعة رقم ${id}`,
                },
            });

        }, { timeout: 20000 });

        await this.updateClientStatus(loan.clientId);

        return {
            message: 'تم الموافقة على السداد بنجاح',
            repaymentId: id,
        };
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
            throw new BadRequestException('السلفة قيد الانتظار');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        // Check if repayment was already approved
        const wasApproved = repayment.status === PaymentStatus.PAID;

        return await this.prisma.$transaction(async (tx) => {
            const journal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                },
                include: { lines: true },
            });

            if (journal) {
                await this.journalService.unpostJournal(currentUser, journal.id);
                await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
                await tx.journalHeader.delete({ where: { id: journal.id } });
            }

            if (wasApproved) {
                let partnerShares: any[] = [];
                if (loan.source === LoanFundSource.GENERAL) {
                    partnerShares = await tx.loanPartnerShare.findMany({
                        where: { loanId: loan.id },
                        include: { partner: { select: { orgProfitPercent: true, upcomingProfit: true } } },
                    });
                } else if (loan.source === LoanFundSource.NEW_CAPITAL) {
                    partnerShares = await tx.loanNewCapitalShare.findMany({
                        where: { loanId: loan.id },
                        include: { partner: { select: { orgProfitPercent: true, upcomingProfit: true } } },
                    });
                }

                const partnerAccruals = await tx.partnerShareAccrual.findMany({ where: { loanId: loan.id } });

                const totalInterest = await tx.repayment.aggregate({
                    where: { loanId: loan.id },
                    _sum: { interestAmount: true },
                }).then(res => res._sum.interestAmount || 0);

                const discount = repayment.amount - repayment.paidAmount;
                const realizedInterest = totalInterest + discount;

                if (realizedInterest > 0) {
                    for (const ps of partnerShares) {
                        const sharePercent =
                            loan.source === LoanFundSource.GENERAL
                                ? Number(ps.sharePercent || 0)
                                : Number(ps.percent || 0);

                        const existingAccrual = partnerAccruals.find(acc => acc.partnerId === ps.partnerId);
                        if (!existingAccrual) continue;

                        const rawShare = Number(((realizedInterest * sharePercent) / 100).toFixed(2));
                        let companyCut = 0;
                        if (existingAccrual.rawShare > 0) {
                            const oldcut = Number(((existingAccrual.companyCut / existingAccrual.rawShare) * 100).toFixed(2));
                            companyCut = Number(((rawShare * oldcut) / 100).toFixed(2));
                        }
                        const partnerFinal = Number((rawShare - companyCut).toFixed(2));

                        const oldPartnerFinal = Number(existingAccrual?.partnerFinal || 0);
                        const ratio = Number((partnerFinal - oldPartnerFinal).toFixed(2));

                        await tx.partner.update({
                            where: { id: ps.partnerId },
                            data: { upcomingProfit: { increment: ratio } },
                        });

                        await tx.partnerShareAccrual.update({
                            where: { id: existingAccrual.id },
                            data: { rawShare, companyCut, partnerFinal },
                        });
                    }
                }
            }

            if (wasApproved) {
                const discount = repayment.amount - repayment.paidAmount;
                await tx.loan.update({
                    where: { id: loan.id },
                    data: {
                        newAmount: loan.newAmount ? loan.newAmount + discount : loan.totalAmount,
                        endDate: null,
                    },
                });

                await tx.repayment.update({
                    where: { id },
                    data: {
                        status: PaymentStatus.PENDING,
                        remaining: repayment.amount,
                        paidAmount: 0,
                        paymentDate: null,
                        reviewStatus: 'REJECTED',
                        notes: dto.notes,
                        attachments: [],
                        PaymentProof: null,
                        interestAmount: repayment.interestAmount + discount,
                    },
                });
            } else {
                await tx.repayment.update({
                    where: { id },
                    data: {
                        status: PaymentStatus.PENDING,
                        remaining: repayment.amount,
                        paidAmount: 0,
                        paymentDate: null,
                        reviewStatus: 'REJECTED',
                        notes: dto.notes,
                        attachments: [],
                        PaymentProof: null,
                        interestAmount: repayment.interestAmount,
                    },
                });
            }

            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_REJECTED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'WHATSAPP',
                });
            } catch (error) {
                console.error('❌ Failed to send WhatsApp notification:', error.message);
            }

            try {
                await this.notificationService.sendNotification({
                    templateType: TemplateType.PAYMENT_REJECTED,
                    clientId: loan.clientId,
                    loanId: loan.id,
                    repaymentId: repayment.id,
                    channel: 'TELEGRAM',
                });
            } catch (error) {
                console.error('❌ Failed to send Telegram notification:', error.message);
            }

            await this.updateClientStatus(loan.clientId);

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} برفض السداد للدفعة رقم ${id} ${wasApproved ? 'وعكس الموافقة السابقة' : ''
                        }`,
                },
            });

            return { message: 'تم رفض سداد الدفعة بنجاح', repaymentId: id };
        }, { timeout: 20000 });
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
            throw new BadRequestException('السلفة غير نشطة');

        if (!dto.newDueDate)
            throw new BadRequestException('يجب تحديد تاريخ استحقاق جديد');

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

        return { message: 'تم تأجيل سداد الدفعة بنجاح', repaymentId: id };
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

        return { message: 'تم رفع مستند اثبات السداد بنجاح', fileUrl: publicUrl };
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
            throw new BadRequestException('السلفة غير نشطة');

        if (paidAmount <= 0)
            throw new BadRequestException('المبلغ المدفوع يجب أن يكون أكبر من صفر');

        const currentPaid = repayment.paidAmount || 0;
        const newPaidAmount = currentPaid + paidAmount;

        if (newPaidAmount > repayment.amount)
            throw new BadRequestException(
                `المبلغ المدفوع يتجاوز مبلغ الدفعة. الحد الأقصى المسموح به: ${repayment.amount - currentPaid}`
            );

        const remaining = parseFloat((repayment.amount - newPaidAmount).toFixed(2));

        // Accounting accounts
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounting accounts');

        const creditAccount = await this.prisma.account.findFirstOrThrow({
            where: { accountBasicType: 'BANK' },
        });

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

            const roundToTwo = (num) => Math.round(num * 100) / 100;

            paidAmount = roundToTwo(paidAmount);
            principalPart = roundToTwo(principalPart);
            interestPart = roundToTwo(interestPart);

            // Create Journal Entry for this partial payment
            const journal = await this.journalService.createJournal(
                {
                    reference: `PARTIAL-${repayment.id}-${Date.now()}`,
                    description: `سداد جزئي للدفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                    lines: [
                        {
                            accountId: creditAccount.id,
                            debit: paidAmount,
                            credit: 0,
                            description: `استلام سداد جزئي للدفعة رقم ${repayment.id} للسلفة رقم ${loan.id}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: principalPart,
                            description: 'سداد جزء من اصل السلفة',
                            clientId: loan.client.id,
                        },
                        {
                            accountId: loanIncome.id,
                            debit: 0,
                            credit: interestPart,
                            description: 'سداد جزء من دخل فوائد السلفة',
                            clientId: loan.client.id,
                        },
                    ],
                },
                currentUser
            );
            await this.journalService.postJournal(journal.journal.id, currentUser)

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

            const remainings = await tx.repayment.count({
                where: { loanId: loan.id, status: { not: PaymentStatus.PAID } },
            });

            if (remainings === 0) {

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

            await this.updateClientStatus(loan.clientId);

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
                message: 'تم تسجيل السداد الجزئي بنجاح',
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
            throw new BadRequestException('لا توجد دفعات للسداد');

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
                `الخصم لا يمكن ان يتعدي باقي الفائدة (${totalRemainingInterest.toFixed(2)})`,
            );
        }

        let finalPayment = totalRemainingPrincipal + (totalRemainingInterest - earlyPaymentDiscount);

        // Step 4: Get accounts
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        const creditAccount = await this.prisma.account.findFirstOrThrow({
            where: { accountBasicType: 'BANK' },
        });

        const roundToTwo = (num) => Math.round(num * 100) / 100;

        finalPayment = roundToTwo(finalPayment);
        totalRemainingPrincipal = roundToTwo(totalRemainingPrincipal);
        totalRemainingInterest = roundToTwo(totalRemainingInterest);

        return await this.prisma.$transaction(async (tx) => {
            // Step 5: Create journal entry
            const journal = await this.journalService.createJournal(
                {
                    reference: `EARLY-${loan.id}`,
                    description: `سداد مبكر للسلفة رقم ${loan.code} بخصم مبلغ ${earlyPaymentDiscount}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: unpaidRepayments[0].id,
                    lines: [
                        { accountId: creditAccount.id, debit: finalPayment, credit: 0, description: `استلام سداد مبكر من العميل ${loan.client.name}` },
                        { accountId: loansReceivable.id, debit: 0, credit: totalRemainingPrincipal, description: 'سداد أصل السلفة بالكامل', clientId: loan.client.id },
                        { accountId: loanIncome.id, debit: 0, credit: totalRemainingInterest - earlyPaymentDiscount, description: 'دخل الفائدة بعد خصم السداد المبكر', clientId: loan.client.id, },
                        { accountId: loansReceivable.id, debit: earlyPaymentDiscount, credit: 0, description: 'خصم' },
                        { accountId: loansReceivable.id, debit: 0, credit: earlyPaymentDiscount, description: 'خصم', clientId: loan.client.id },
                    ],
                },
                currentUserId
            );
            await this.journalService.postJournal(journal.journal.id, currentUserId)

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

            await this.updateClientStatus(loan.clientId);

            // Step 7: Partner Share Accrual
            let partnerShares: any[] = [];

            if (loan.source === LoanFundSource.GENERAL) {
                partnerShares = await tx.loanPartnerShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            } else if (loan.source === LoanFundSource.NEW_CAPITAL) {
                partnerShares = await tx.loanNewCapitalShare.findMany({
                    where: { loanId: loan.id },
                    include: { partner: { select: { orgProfitPercent: true } } },
                });
            }

            const partnerAccruals = await this.prisma.partnerShareAccrual.findMany({
                where: { loanId: loanId },
            })

            const realizedInterest = Number(loan.interestAmount) - earlyPaymentDiscount;

            if (realizedInterest > 0) {
                for (const ps of partnerShares) {

                    const sharePercent =
                        loan.source === LoanFundSource.GENERAL
                            ? Number(ps.sharePercent || 0)
                            : Number(ps.percent || 0);

                    const existingAccrual = partnerAccruals.find(
                        (acc) => acc.partnerId === ps.partnerId
                    );

                    let oldcut = 0;
                    if (existingAccrual && existingAccrual.rawShare > 0) {
                        oldcut = Number(
                            ((existingAccrual.companyCut / existingAccrual.rawShare) * 100).toFixed(2)
                        );
                    }

                    const rawShare = Number(((realizedInterest * sharePercent) / 100).toFixed(2));
                    const companyCut = Number(((rawShare * oldcut) / 100).toFixed(2));
                    const partnerFinal = Number((rawShare - companyCut).toFixed(2));

                    const oldPartnerFinal = Number(existingAccrual?.partnerFinal || 0);
                    const ratio = Number((oldPartnerFinal - partnerFinal).toFixed(2));

                    if (rawShare === 0 && companyCut === 0) continue;

                    if (existingAccrual) {
                        await tx.partnerShareAccrual.update({
                            where: { id: existingAccrual.id },
                            data: {
                                rawShare,
                                companyCut,
                                partnerFinal,
                            },
                        });

                        await tx.partner.update({
                            where: { id: existingAccrual.partnerId },
                            data: {
                                upcomingProfit: {
                                    decrement: ratio,
                                },
                            }
                        })
                    }
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
                    newAmount: loan.totalAmount - earlyPaymentDiscount,
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
                message: 'تم تسجيل السداد المبكر بنجاح',
                finalPayment: finalPayment.toFixed(2),
                journalId: journal.journal.id,
            };
        });
    }

    // Approve multiple repayments
    async approveMany(currentUser: number, ids: number[], dto: RepaymentDto) {
        if (!ids || ids.length === 0) throw new BadRequestException('No repayment IDs provided');

        const results = [] as any;

        for (const id of ids) {
            try {
                const res = await this.approveRepayment(currentUser, id, dto);
                results.push({ id, status: 'success', message: res.message });
            } catch (error: any) {
                results.push({ id, status: 'failed', message: error.message });
            }
        }

        return results;
    }

    // Reject multiple repayments
    async rejectMany(currentUser: number, ids: number[], dto: RepaymentDto) {
        if (!ids || ids.length === 0) throw new BadRequestException('No repayment IDs provided');

        const results = [] as any;

        for (const id of ids) {
            try {
                const res = await this.rejectRepayment(currentUser, id, dto);
                results.push({ id, status: 'success', message: res.message });
            } catch (error: any) {
                results.push({ id, status: 'failed', message: error.message });
            }
        }

        return results;
    }

    // Upload payment proof for multiple repayments
    async uploadPaymentProofBulk(
        currentUser: number,
        repaymentIds: number[],
        file: Express.Multer.File,
    ) {
        if (!repaymentIds || repaymentIds.length === 0) {
            throw new BadRequestException('يجب إرسال معرفات الدفعات');
        }

        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const ids = Array.isArray(repaymentIds)
            ? repaymentIds.map(id => Number(id))
            : [Number(repaymentIds)];

        if (!ids.length || ids.some(id => !Number.isInteger(id))) {
            throw new BadRequestException('Invalid repaymentIds');
        }

        const repayments = await this.prisma.repayment.findMany({
            where: { id: { in: ids } },
            include: { client: true },
        });

        if (repayments.length !== repaymentIds.length) {
            throw new BadRequestException('بعض الدفعات غير موجودة');
        }

        const nationalIds = new Set(
            repayments.map(r => r.client?.nationalId),
        );

        if (nationalIds.size !== 1) {
            throw new BadRequestException('يجب أن تكون جميع الدفعات لنفس العميل');
        }

        const nationalId = repayments[0].client?.nationalId;
        if (!nationalId) {
            throw new BadRequestException('Client national ID not found');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', nationalId);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filename = `اثبات-السداد-${ids[0]}${path.extname(file.originalname)}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);

        const relPath = path
            .relative(process.cwd(), filePath)
            .replace(/\\/g, '/');

        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        for (const repayment of repayments) {
            if (typeof repayment.PaymentProof === 'string') {
                try {
                    const urlPath = new URL(repayment.PaymentProof).pathname;
                    const prevLocal = path.join(
                        process.cwd(),
                        urlPath.replace(/^\//, ''),
                    );
                    if (fs.existsSync(prevLocal)) {
                        fs.unlinkSync(prevLocal);
                    }
                } catch { }
            }

            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { PaymentProof: publicUrl },
            });

            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Repayments',
                    action: 'CREATE',
                    description: `قام المستخدم ${user?.name} بتحميل اثبات سداد مشترك للدفعة رقم ${repayment.id}`,
                },
            });
        }

        return {
            message: 'تم رفع إثبات السداد بنجاح لجميع الدفعات',
            fileUrl: publicUrl,
            repaymentsCount: repayments.length,
        };
    }
}