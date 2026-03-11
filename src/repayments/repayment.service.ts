import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RepaymentDto } from './dto/repayment.dto';
import { PaymentStatus, JournalSourceType, TemplateType, LoanStatus, LoanFundSource } from '@prisma/client';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
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
                status: LoanStatus.ACTIVE,
            },
            include: {
                repayments: true,
            },
        });

        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' as any },
            });
            return;
        }

        const allRepayments = loans.flatMap(l => l.repayments);
        const now = new Date();

        const hasOverdue = allRepayments.some(r =>
            r.status === 'OVERDUE' ||
            (r.status === 'PENDING' && r.dueDate < now)
        );

        const allPaid = allRepayments.every(r =>
            r.status === 'PAID' || r.status === 'EARLY_PAID'
        );

        let newStatus: any = 'نشط';

        if (hasOverdue) {
            newStatus = 'متعثر';
        } else if (allPaid) {
            newStatus = 'منتهي';
        }

        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }

    private async updatePartnerShareAccruals(
        tx: any,
        loan: any,
        realizedInterest: number,
        partnerShares: any[],
        repaymentId: number,
        alreadyAccumulatedInterest?: number
    ) {
        const period = await tx.periodHeader.findFirst({
            where: { endDate: null },
            orderBy: { startDate: 'desc' }
        });

        if (!period) throw new BadRequestException('No open period found');
        const periodId = period.id;

        const generalShares = partnerShares.filter(s => s.sharePercent !== undefined);
        const newCapitalShares = partnerShares.filter(
            s => s.percent !== undefined && s.sharePercent === undefined
        );

        const sources: { type: LoanFundSource; shares: any[]; totalInterest: number }[] = [
            {
                type: 'GENERAL',
                shares: generalShares,
                totalInterest: Number(loan.generalInterestAmount || 0),
            },
            {
                type: 'NEW_CAPITAL',
                shares: newCapitalShares,
                totalInterest: Number(loan.newCapitalInterestAmount || 0),
            },
        ];

        const totalOriginalInterest =
            Number(loan.generalInterestAmount || 0) + Number(loan.newCapitalInterestAmount || 0);

        if (totalOriginalInterest === 0) return;

        const bankerRound = (value: number, decimals: number = 2): number => {
            const factor = Math.pow(10, decimals);
            const shifted = value * factor;
            const floor = Math.floor(shifted);
            const remainder = shifted - floor;
            if (remainder < 0.5) return floor / factor;
            if (remainder > 0.5) return (floor + 1) / factor;
            return (floor % 2 === 0 ? floor : floor + 1) / factor;
        };

        let totalInterestBeforeThisRepayment: number;

        if (alreadyAccumulatedInterest !== undefined) {
            totalInterestBeforeThisRepayment = alreadyAccumulatedInterest;
        } else {
            totalInterestBeforeThisRepayment = await tx.partnerShareAccrual.aggregate({
                where: { loanId: loan.id },
                _sum: { rawShare: true },
            }).then((r: any) => Number(r._sum.rawShare || 0));
        }

        const totalInterestIncludingThis = Number(
            (totalInterestBeforeThisRepayment + realizedInterest).toFixed(2)
        );

        for (const source of sources) {
            if (source.shares.length === 0 || source.totalInterest <= 0) continue;

            const sourceRatio = source.totalInterest / totalOriginalInterest;

            const sourceInterestThisRepayment = Number((realizedInterest * sourceRatio).toFixed(2));

            const sourceTotalSoFar = Number((totalInterestIncludingThis * sourceRatio).toFixed(2));

            const accruals = source.shares.map(s => {
                const sharePercent = source.type === 'GENERAL'
                    ? Number(s.sharePercent || 0)
                    : Number(s.percent || 0);
                return {
                    partnerId: s.partnerId,
                    orgPercent: Number(s.orgProfitPercent || 0),
                    sharePercent,
                };
            });

            const previousAccruals = await tx.partnerShareAccrual.groupBy({
                by: ['partnerId'],
                where: { loanId: loan.id, source: source.type },
                _sum: { rawShare: true, companyCut: true, partnerFinal: true },
            });

            const previousRawMap = new Map<number, number>(
                previousAccruals.map((p: any) => [p.partnerId, Number(p._sum.rawShare || 0)])
            );
            const previousCompanyCutMap = new Map<number, number>(
                previousAccruals.map((p: any) => [p.partnerId, Number(p._sum.companyCut || 0)])
            );
            const previousPartnerFinalMap = new Map<number, number>(
                previousAccruals.map((p: any) => [p.partnerId, Number(p._sum.partnerFinal || 0)])
            );

            const idealRawCumulative: number[] = [];
            let idealRawSum = 0;
            for (let i = 0; i < accruals.length; i++) {
                if (i === accruals.length - 1) {
                    idealRawCumulative.push(Number((sourceTotalSoFar - idealRawSum).toFixed(2)));
                } else {
                    const v = Number((sourceTotalSoFar * (accruals[i].sharePercent / 100)).toFixed(2));
                    idealRawCumulative.push(v);
                    idealRawSum += v;
                }
            }

            const rawShareArr: number[] = idealRawCumulative.map((ideal, i) =>
                Number((ideal - (previousRawMap.get(accruals[i].partnerId) || 0)).toFixed(2))
            );

            const rawSum = Number(rawShareArr.reduce((a, b) => a + b, 0).toFixed(2));
            const rawDiff = Number((sourceInterestThisRepayment - rawSum).toFixed(2));
            if (rawDiff !== 0) {
                const idx = accruals
                    .map((a, i) => ({
                        i,
                        underpaid: idealRawCumulative[i] - (previousRawMap.get(a.partnerId) || 0) - rawShareArr[i],
                    }))
                    .sort((a, b) => b.underpaid - a.underpaid)[0].i;
                rawShareArr[idx] = Number((rawShareArr[idx] + rawDiff).toFixed(2));
            }

            const idealCompanyCutCumulative: number[] = idealRawCumulative.map((ideal, i) =>
                bankerRound(ideal * (accruals[i].orgPercent / 100))
            );

            const companyCutArr: number[] = idealCompanyCutCumulative.map((ideal, i) =>
                Number((ideal - (previousCompanyCutMap.get(accruals[i].partnerId) || 0)).toFixed(2))
            );

            const partnerFinalArr: number[] = rawShareArr.map((raw, i) =>
                Number((raw - companyCutArr[i]).toFixed(2))
            );

            const expectedNet = Number(
                (sourceInterestThisRepayment - companyCutArr.reduce((a, b) => a + b, 0)).toFixed(2)
            );
            const netSum = Number(partnerFinalArr.reduce((a, b) => a + b, 0).toFixed(2));
            const netDiff = Number((expectedNet - netSum).toFixed(2));
            if (netDiff !== 0) {
                const idx = accruals
                    .map((a, i) => ({
                        i,
                        underpaid: (idealRawCumulative[i] - idealCompanyCutCumulative[i])
                            - (previousPartnerFinalMap.get(a.partnerId) || 0)
                            - partnerFinalArr[i],
                    }))
                    .sort((a, b) => b.underpaid - a.underpaid)[0].i;
                partnerFinalArr[idx] = Number((partnerFinalArr[idx] + netDiff).toFixed(2));
            }

            for (let i = 0; i < accruals.length; i++) {
                await tx.partnerShareAccrual.create({
                    data: {
                        periodId,
                        loanId: loan.id,
                        repaymentId,
                        partnerId: accruals[i].partnerId,
                        rawShare: rawShareArr[i],
                        companyCut: companyCutArr[i],
                        partnerFinal: partnerFinalArr[i],
                        source: source.type,
                    },
                });
            }
        }
    }

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
                RepaymentPayment: {
                    select: { repaymentId: true, proofUrl: true }
                }
            }
        }
        );

        if (!repayment) throw new NotFoundException('Repayment not found');
        return repayment;
    }

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

        if (repayment.status === PaymentStatus.PARTIAL_PAID)
            throw new BadRequestException('الدفعة مدفوعة جزئياً');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const roundToTwo = (num) => Math.round(num * 100) / 100;

        const totalAmount = roundToTwo(dto.paidAmount ?? repayment.amount);
        const interestAmount = roundToTwo(repayment.interestAmount);
        const principalAmount = roundToTwo(repayment.principalAmount);

        const discount = dto.discount ? roundToTwo(dto.discount) : 0;

        const totalInterest = await this.prisma.repayment.aggregate({
            where: { loanId: loan.id },
            _sum: { interestAmount: true },
        }).then(res => res._sum.interestAmount || 0);

        if (discount > totalAmount) {
            throw new BadRequestException(
                `الخصم لا يمكن أن يتجاوز الفائدة  (${totalAmount})`
            );
        }

        if (discount > totalInterest) {
            throw new BadRequestException(
                `الخصم لا يمكن أن يتجاوز إجمالي الفائدة المستحقة على السلفة (${totalInterest})`
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

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUser);
            }

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
                    discount: discount
                },
            });


            const generalShares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const newCapitalShares = await tx.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const partnerShares = [...generalShares, ...newCapitalShares];

            const realizedInterest = netInterest;

            await this.updatePartnerShareAccruals(tx, loan, realizedInterest, partnerShares, repayment.id);

            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    newAmount: loan.newAmount ? loan.newAmount - discount : loan.totalAmount - discount,
                },
            });


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


        const wasApproved = repayment.status === PaymentStatus.PAID || repayment.status === PaymentStatus.EARLY_PAID || repayment.status === PaymentStatus.PARTIAL_PAID;

        return await this.prisma.$transaction(async (tx) => {

            const journals = await tx.journalHeader.findMany({
                where: {
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: repayment.id,
                },
                include: { lines: true },
            });

            if (journals.length > 0) {
                for (const journal of journals) {
                    await this.journalService.unpostJournal(currentUser, journal.id);
                    await tx.journalLine.deleteMany({ where: { journalId: journal.id } });
                    await tx.journalHeader.delete({ where: { id: journal.id } });
                }
            }

            if (wasApproved) {
                await tx.partnerShareAccrual.deleteMany({ where: { repaymentId: repayment.id } });
                const discount = repayment.discount ?? 0;
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
                        discount: 0,
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
                        discount: 0,
                    },
                });
            }
            await tx.repaymentCount.deleteMany({ where: { repaymentId: repayment.id } });
            await tx.repaymentPayment.deleteMany({ where: { repaymentId: repayment.id } });

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


        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounting accounts');

        const creditAccount = await this.prisma.account.findFirstOrThrow({
            where: { accountBasicType: 'BANK' },
        });

        return await this.prisma.$transaction(async tx => {


            const totalPrincipal = repayment.principalAmount;
            const totalInterest = repayment.amount - repayment.principalAmount;

            const alreadyPaidInterest = Math.max(currentPaid - totalPrincipal, 0);
            const remainingInterest = totalInterest - alreadyPaidInterest;

            let principalPart = 0;
            let interestPart = 0;


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

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUser);
            }

            const generalShares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const newCapitalShares = await tx.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const partnerShares = [...generalShares, ...newCapitalShares];

            if (interestPart > 0) {
                await this.updatePartnerShareAccruals(
                    tx,
                    loan,
                    interestPart,
                    partnerShares,
                    repayment.id
                );
            }

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

            await this.updateClientStatus(loan.clientId);


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

        const unpaidRepayments = loan.repayments.filter(
            r => r.status !== 'PAID' && r.status !== 'EARLY_PAID'
        );

        if (unpaidRepayments.length === 0)
            throw new BadRequestException('لا توجد دفعات للسداد');

        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;

        unpaidRepayments.forEach(rep => {
            const remainingPrincipal = rep.principalAmount - (rep.paidAmount || 0);
            const paidInterest = Math.max((rep.paidAmount || 0) - rep.principalAmount, 0);
            const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

            totalRemainingPrincipal += Math.max(remainingPrincipal, 0);
            totalRemainingInterest += Math.max(remainingInterest, 0);
        });

        const totalInterest = await this.prisma.repayment.aggregate({
            where: { loanId: loan.id },
            _sum: { interestAmount: true },
        }).then(res => res._sum.interestAmount || 0);

        if (earlyPaymentDiscount > totalInterest) {
            throw new BadRequestException(
                `الخصم لا يمكن ان يتعدي باقي الفائدة (${totalInterest.toFixed(2)})`,
            );
        }

        const previouslyDistributedInterest = await this.prisma.partnerShareAccrual.aggregate({
            where: { loanId: loan.id },
            _sum: { rawShare: true },
        }).then((r) => Number(r._sum.rawShare || 0));

        const roundToTwo = (num) => Math.round(num * 100) / 100;

        let finalPayment = roundToTwo(totalRemainingPrincipal + (totalRemainingInterest - earlyPaymentDiscount));
        let finalremainingInterest = roundToTwo(totalRemainingInterest);
        let finalremainingPrincipal = roundToTwo(totalRemainingPrincipal);

        const loansReceivable = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOANS_RECEIVABLE' } });
        const loanIncome = await this.prisma.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });

        if (!loansReceivable || !loanIncome)
            throw new BadRequestException('Missing required accounts setup');

        const creditAccount = await this.prisma.account.findFirstOrThrow({
            where: { accountBasicType: 'BANK' },
        });

        return await this.prisma.$transaction(async (tx) => {

            const journal = await this.journalService.createJournal(
                {
                    reference: `EARLY-${loan.id}`,
                    description: `سداد مبكر للسلفة رقم ${loan.code} بخصم مبلغ ${earlyPaymentDiscount}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.REPAYMENT,
                    sourceId: unpaidRepayments[0].id,
                    lines: [
                        { accountId: creditAccount.id, debit: finalPayment, credit: 0, description: `استلام سداد مبكر من العميل ${loan.client.name}` },
                        { accountId: loansReceivable.id, debit: 0, credit: finalremainingPrincipal, description: 'سداد أصل السلفة بالكامل', clientId: loan.client.id },
                        { accountId: loanIncome.id, debit: 0, credit: finalremainingInterest - earlyPaymentDiscount, description: 'دخل الفائدة بعد خصم السداد المبكر', clientId: loan.client.id },
                        { accountId: loansReceivable.id, debit: earlyPaymentDiscount, credit: 0, description: 'خصم' },
                        { accountId: loansReceivable.id, debit: 0, credit: earlyPaymentDiscount, description: 'خصم', clientId: loan.client.id },
                    ],
                },
                currentUserId
            );

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.journal.id, currentUserId);
            }

            const discountRatio = totalRemainingInterest > 0
                ? earlyPaymentDiscount / totalRemainingInterest
                : 0;
            let interestDistributed = 0;

            for (const [index, rep] of unpaidRepayments.entries()) {
                const alreadyPaid = rep.paidAmount || 0;
                const remainingPrincipal = rep.principalAmount - alreadyPaid;
                const paidInterest = Math.max(alreadyPaid - rep.principalAmount, 0);
                const remainingInterest = rep.amount - rep.principalAmount - paidInterest;

                let interestDiscount = totalRemainingInterest > 0
                    ? parseFloat((remainingInterest * discountRatio).toFixed(2))
                    : 0;
                let interestPortion = totalRemainingInterest > 0
                    ? parseFloat((remainingInterest - interestDiscount).toFixed(2))
                    : 0;

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
                        discount: interestDiscount,
                        reviewStatus: 'APPROVED',
                        notes: `تم السداد المبكر مع خصم الفائدة ${interestDiscount.toFixed(2)}`,
                    },
                });
            }

            await this.updateClientStatus(loan.clientId);

            const generalShares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const newCapitalShares = await tx.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });

            const partnerShares = [...generalShares, ...newCapitalShares];

            const realizedInterest = roundToTwo(finalremainingInterest - earlyPaymentDiscount);

            await this.updatePartnerShareAccruals(
                tx,
                loan,
                realizedInterest,
                partnerShares,
                unpaidRepayments[0].id,
                previouslyDistributedInterest,
            );

            await tx.loan.update({
                where: { id: loan.id },
                data: {
                    earlyPaidAmount: totalRemainingPrincipal + totalRemainingInterest,
                    earlyPaymentDiscount,
                    settlementJournalId: journal.journal.id,
                },
            });

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

    async approveMany(currentUser: number, ids: number[], dto: RepaymentDto) {
        if (!ids || ids.length === 0) throw new BadRequestException('No repayment IDs provided');

        const repayments = await this.prisma.repayment.findMany({
            where: {
                id: { in: ids },
            },
            select: {
                id: true,
                status: true,
            },
        });

        const partialPaid = repayments.find(
            r => r.status === 'PARTIAL_PAID'
        );

        if (partialPaid) {
            throw new BadRequestException(
                `لا يمكن الموافقة على الدفعة رقم ${partialPaid.id} لأنها مدفوعة جزئياً`
            );
        }

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
}