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

    // // Approve repayment (updated with partner distribution)
    // async approveRepayment(currentUser, id: number, dto: RepaymentDto) {
    //     const repayment = await this.prisma.repayment.findUnique({
    //         where: { id },
    //         include: { loan: { include: { client: true } } },
    //     });
    //     if (!repayment) throw new NotFoundException('لم يتم العثور على الدفعة');

    //     const loan = repayment.loan;
    //     if (!loan) throw new NotFoundException('لم يتم العثور على القرض');

    //     if (loan.status === LoanStatus.PENDING)
    //         throw new BadRequestException('القرض في حالة انتظار');

    //     if (repayment.status === PaymentStatus.PAID)
    //         throw new BadRequestException('الدفعة مُعتمدة بالفعل');

    //     const user = await this.prisma.user.findUnique({
    //         where: { id: currentUser },
    //     });

    //     const totalAmount = dto.paidAmount ?? repayment.amount;
    //     const interestAmount = repayment.interestAmount || 0;
    //     const principalAmount = repayment.principalAmount || 0;

    //     // حساب الحسابات الأساسية
    //     const bankAccount = await this.prisma.account.findFirst({
    //         where: { accountBasicType: 'BANK' },
    //     });
    //     const loansReceivable = await this.prisma.account.findFirst({
    //         where: { accountBasicType: 'LOANS_RECEIVABLE' },
    //     });
    //     const loanIncome = await this.prisma.account.findFirst({
    //         where: { accountBasicType: 'LOAN_INCOME' },
    //     });
    //     const companyAccount = await this.prisma.account.findFirst({
    //         where: { accountBasicType: 'COMPANY_SHARES' },
    //     });

    //     if (!bankAccount || !loansReceivable || !loanIncome)
    //         throw new BadRequestException('الاعداد المحاسبي مفقود (Bank / Loans Receivable / Loan Income)');

    //     // جلب الشركاء النشطين لتوزيع الفائدة
    //     const partners = await this.prisma.partner.findMany({
    //         where: { isActive: true },
    //         select: {
    //             id: true,
    //             name: true,
    //             capitalAmount: true,
    //             orgProfitPercent: true,
    //             accountPayableId: true,
    //         },
    //     });

    //     // حساب رأس المال الإجمالي ونسب الشركاء
    //     const totalCapital = partners.reduce((s, p) => s + (p.capitalAmount || 0), 0);

    //     // إذا مفيش شركاء أو رأس المال = 0 -> نحافظ على السلوك القديم (نكتب الفائدة كـ income بدون توزيع)
    //     const shouldDistribute = partners.length > 0 && totalCapital > 0 && interestAmount > 0;

    //     return await this.prisma.$transaction(async (tx) => {
    //         // بناء خطوط القيود الأساسية (استلام من العميل: Bank / LoansReceivable / LoanIncome)
    //         const journalLines: Array<any> = [
    //             {
    //                 accountId: bankAccount.id,
    //                 debit: totalAmount,
    //                 credit: 0,
    //                 description: `استلام سداد للقسط رقم ${repayment.id} من ${loan.client?.name || 'العميل'}`,
    //             },
    //             {
    //                 accountId: loansReceivable.id,
    //                 debit: 0,
    //                 credit: principalAmount,
    //                 description: 'تسوية أصل القسط',
    //                 clientId: loan.clientId,
    //             },
    //             {
    //                 accountId: loanIncome.id,
    //                 debit: 0,
    //                 credit: interestAmount,
    //                 description: 'دخل الفائدة للقسط',
    //             },
    //         ];

    //         // اذا هنوزع الفائدة على الشركاء: نضيف خطوط تحويل الفائدة (ندين Loan Income ثم نقيد المستحقات والشركة)
    //         if (shouldDistribute) {
    //             // أولاً: سطر لدين (debit) حساب Loan Income بقيمة الفائدة كاملة (لتحريكها)
    //             journalLines.push({
    //                 accountId: loanIncome.id,
    //                 debit: interestAmount,
    //                 credit: 0,
    //                 description: `تحويل أرباح الدفعة رقم ${repayment.id} للمستحقين والشركة`,
    //             });

    //             // نحسب ونبني خطوط الائتمان لكل شريك وحصة الشركة
    //             let companyTotalCut = 0;
    //             for (const partner of partners) {
    //                 if (!partner.accountPayableId) {
    //                     throw new BadRequestException(`حساب مستحقات الشريك غير معرّف للشريك ${partner.name}`);
    //                 }
    //                 const partnerPercent = (partner.capitalAmount || 0) / totalCapital;
    //                 const partnerGross = +(interestAmount * partnerPercent); // قبل خصم حصة الشركة
    //                 const orgPercent = (partner.orgProfitPercent || 0) / 100;
    //                 const companyCut = +(partnerGross * orgPercent);
    //                 const partnerNet = +(partnerGross - companyCut);

    //                 // تجنب الأرقام العشرية المتكررة: نحتفظ بقيمتين عشرية
    //                 const partnerNetRounded = Number(partnerNet.toFixed(2));
    //                 const companyCutRounded = Number(companyCut.toFixed(2));

    //                 if (partnerNetRounded > 0) {
    //                     journalLines.push({
    //                         accountId: partner.accountPayableId,
    //                         debit: 0,
    //                         credit: partnerNetRounded,
    //                         description: `مستحقات شريك ${partner.name} عن الدفعة رقم ${repayment.id}`,
    //                     });

    //                     // سجل توزيع مؤجل في جدول PartnerShareAccrual
    //                     await tx.partnerShareAccrual.create({
    //                         data: {
    //                             partnerId: partner.id,
    //                             loanId: loan.id,
    //                             repaymentId: repayment.id,
    //                             amount: partnerNetRounded,
    //                         },
    //                     });
    //                 }

    //                 companyTotalCut += companyCutRounded;
    //             }

    //             // إذا كان هناك حصة للشركة نضيف سطر لها (نستخدم حساب COMPANY_SHARES إن وُجد، وإلا نستخدم loanIncome كبديل)
    //             const companyAccountToUse = companyAccount ? companyAccount : loanIncome;
    //             if (companyTotalCut > 0) {
    //                 // نقرّب أيضًا إلى خانتين عشريتين
    //                 const companyTotalRounded = Number(companyTotalCut.toFixed(2));
    //                 journalLines.push({
    //                     accountId: companyAccountToUse.id,
    //                     debit: 0,
    //                     credit: companyTotalRounded,
    //                     description: `حصة الشركة من أرباح الدفعة رقم ${repayment.id}`,
    //                 });
    //             }
    //         }

    //         // إنشاء القيد عبر journalService (يحتوي كل الخطوط)
    //         const journal = await this.journalService.createJournal(
    //             {
    //                 reference: `REP-${repayment.id}`,
    //                 description: `ترحيل استلام القسط وتوزيع الأرباح للقسط رقم ${repayment.id} (قرض: ${loan.code})`,
    //                 type: 'GENERAL',
    //                 sourceType: JournalSourceType.REPAYMENT,
    //                 sourceId: repayment.id,
    //                 lines: journalLines,
    //             },
    //             currentUser,
    //         );

    //         // تحديث حالة الدفعة
    //         const updatedRepayment = await tx.repayment.update({
    //             where: { id },
    //             data: {
    //                 paidAmount: totalAmount,
    //                 status: PaymentStatus.PAID,
    //                 paymentDate: new Date(),
    //                 notes: dto.notes,
    //                 reviewStatus: 'APPROVED',
    //                 remaining: 0,
    //             },
    //         });

    //         // لو مفيش أقساط متبقية نكمل إغلاق القرض كما كان
    //         const remaining = await tx.repayment.count({
    //             where: { loanId: loan.id, status: { not: PaymentStatus.PAID } },
    //         });

    //         if (remaining === 0) {
    //             const totalPaidAmount = await tx.repayment.aggregate({
    //                 where: { loanId: loan.id },
    //                 _sum: { paidAmount: true },
    //             }).then(res => res._sum.paidAmount || 0);

    //             await tx.loan.update({
    //                 where: { id: loan.id },
    //                 data: {
    //                     status: 'COMPLETED',
    //                     endDate: new Date(),
    //                     newAmount: totalPaidAmount,
    //                 },
    //             });
    //         }

    //         // ارسال اشعارات (WhatsApp, Telegram) - كما في القديم
    //         try {
    //             await this.notificationService.sendNotification({
    //                 templateType: TemplateType.PAYMENT_APPROVED,
    //                 clientId: loan.clientId,
    //                 loanId: loan.id,
    //                 repaymentId: repayment.id,
    //                 channel: 'WHATSAPP',
    //             });
    //         } catch (error) {
    //             console.error('❌ فشل إرسال اشعار WhatsApp:', (error as Error).message);
    //         }

    //         try {
    //             await this.notificationService.sendNotification({
    //                 templateType: TemplateType.PAYMENT_APPROVED,
    //                 clientId: loan.clientId,
    //                 loanId: loan.id,
    //                 repaymentId: repayment.id,
    //                 channel: 'TELEGRAM',
    //             });
    //         } catch (error) {
    //             console.error('❌ فشل إرسال اشعار Telegram:', (error as Error).message);
    //         }

    //         // تحديث حالة العميل
    //         await this.updateClientStatus(loan.clientId);

    //         // سجل تدقيق
    //         await tx.auditLog.create({
    //             data: {
    //                 userId: currentUser,
    //                 screen: 'Repayments',
    //                 action: 'POST',
    //                 description: `قام المستخدم ${user?.name} بالموافقة على السداد للدفعة رقم ${id}`,
    //             },
    //         });

    //         return {
    //             message: 'تمت الموافقة على السداد وتوزيع الأرباح للمساهمين (إن وجدوا) بنجاح',
    //             repaymentId: id,
    //             journalId: journal.journal.id,
    //         };
    //     });
    // }

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
                repayments: { orderBy: { dueDate: 'asc' } },
                client: true,
            },
        });

        if (!loan) throw new NotFoundException('Loan not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUserId } });

        // Step 1: حساب مجموع الأقساط غير المدفوعة
        const unpaidRepayments = loan.repayments.filter(
            r => r.status !== 'PAID' && r.status !== 'EARLY_PAID'
        );

        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;
        let totalAlreadyPaid = 0;

        loan.repayments.forEach(rep => {
            const remainingPrincipal = rep.principalAmount - rep.paidAmount;
            const paidInterest = Math.max(rep.paidAmount - rep.principalAmount, 0);
            const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

            if (rep.status !== 'PAID' && rep.status !== 'EARLY_PAID') {
                totalRemainingPrincipal += Math.max(remainingPrincipal, 0);
                totalRemainingInterest += Math.max(remainingInterest, 0);
            }

            totalAlreadyPaid += rep.paidAmount || 0;
        });

        // Step 2: التحقق من الخصم
        if (earlyPaymentDiscount > totalRemainingInterest) {
            throw new BadRequestException(
                `الخصم لا يمكن أن يتجاوز الفائدة المتبقية (${totalRemainingInterest.toFixed(2)})`
            );
        }

        // Step 3: حساب المبلغ النهائي بعد الخصم
        const totalDue = totalRemainingPrincipal + totalRemainingInterest;
        const finalPayment = totalRemainingPrincipal + (totalRemainingInterest - earlyPaymentDiscount);

        // Step 4: توزيع الأقساط الجديدة بعد الخصم
        const principalPerInstallment = parseFloat(
            (totalRemainingPrincipal / unpaidRepayments.length).toFixed(2)
        );
        const interestPerInstallment = 0; // بعد تطبيق الخصم، الفائدة المتبقية = 0

        // Step 5: إعداد الحسابات (Bank, Loans Receivable, Loan Income)
        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!bankAccount || !loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        return await this.prisma.$transaction(async (tx) => {
            // Step 6: إنشاء قيد اليومية
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
                            debit: finalPayment,
                            credit: 0,
                            description: `استلام سداد مبكر من العميل ${loan.client.name}`,
                        },
                        {
                            accountId: loansReceivable.id,
                            debit: 0,
                            credit: totalRemainingPrincipal,
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
                currentUserId
            );

            // Step 7: تحديث الأقساط غير المدفوعة
            for (const [index, rep] of unpaidRepayments.entries()) {
                let paidAmount = principalPerInstallment;
                // تعديل القسط الأخير لتصحيح الفارق الناتج عن التقريب
                if (index === unpaidRepayments.length - 1) {
                    const sumPrevious = principalPerInstallment * (unpaidRepayments.length - 1);
                    paidAmount = totalRemainingPrincipal - sumPrevious;
                }

                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        status: 'EARLY_PAID',
                        paidAmount,
                        principalAmount: paidAmount,
                        interestAmount: interestPerInstallment,
                        remaining: 0,
                        paymentDate: new Date(),
                        reviewStatus: 'APPROVED',
                        notes: `تم السداد المبكر مع خصم الفائدة ${earlyPaymentDiscount.toFixed(2)}`,
                    },
                });
            }

            // Step 8: تحديث القرض
            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    status: 'COMPLETED',
                    earlyPaidAmount: totalDue,
                    earlyPaymentDiscount,
                    endDate: new Date(),
                    settlementJournalId: journal.journal.id,
                    newAmount: totalAlreadyPaid + finalPayment,
                },
            });

            // Step 9: تسجيل العملية في سجل التدقيق
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
                totalRemainingPrincipal: totalRemainingPrincipal.toFixed(2),
                totalRemainingInterest: totalRemainingInterest.toFixed(2),
                totalDue: totalDue.toFixed(2),
                finalPayment: finalPayment.toFixed(2),
                earlyPaymentDiscount: earlyPaymentDiscount.toFixed(2),
                totalPaidIncludingPartial: (totalAlreadyPaid + finalPayment).toFixed(2),
                journalId: journal.journal.id,
            };
        });
    }
}