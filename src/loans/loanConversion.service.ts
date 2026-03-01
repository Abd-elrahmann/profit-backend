import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoanStatus, LoanType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalService } from '../journal/journal.service';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class LoansConversionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
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

    async convertLoanClient(clientAId: number, clientBId: number, loanId: number, kafeelId: number | null, userId: number) {
        const clientA = await this.prisma.client.findUnique({ where: { id: clientAId } });
        const clientB = await this.prisma.client.findUnique({ where: { id: clientBId }, include: { kafeelS: true } });
        if (!clientA || !clientB) throw new NotFoundException('Client not found');

        let selectedKafeel: any = null;
        let newKafeelId: number | null = null;

        if (kafeelId) {
            if (!clientB.kafeelS || clientB.kafeelS.length === 0) {
                throw new BadRequestException('العميل المحول إليه لا يملك كفلاء');
            }

            selectedKafeel = clientB.kafeelS.find(k => k.id === kafeelId);

            if (!selectedKafeel) {
                throw new BadRequestException('الكفيل المختار لا ينتمي إلى العميل المحول إليه');
            }

            newKafeelId = selectedKafeel!.id;
        }

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { repayments: true },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.clientId !== clientAId) {
            throw new BadRequestException('السلف لا تنتمي للعميل المصدر');
        }

        const remainingReps = loan.repayments.filter(r => r.remaining > 0);
        if (remainingReps.length === 0) {
            throw new BadRequestException('لا يوجد مبالغ متبقية لتحويلها');
        }

        const totalTransferredAmount = remainingReps.reduce((sum, r) => sum + r.remaining, 0);

        await this.prisma.$transaction(async (tx) => {
            await tx.loan.update({
                where: { id: loanId },
                data: {
                    clientId: clientBId,
                    kafeelId: newKafeelId,
                },
            });

            for (const rep of remainingReps) {
                await tx.repayment.update({
                    where: { id: rep.id },
                    data: { clientId: clientBId },
                });
            }


            const receivableAccount = await tx.account.findFirst({
                where: { accountBasicType: 'LOANS_RECEIVABLE' },
            });
            if (!receivableAccount) throw new NotFoundException('Loans receivable account not found');

            const { journal } = await this.journalService.createJournal({
                reference: `CONV - ${Date.now()}`,
                description: `تحويل رصيد السلفة رقم ${loanId} من العميل ${clientAId} إلى العميل ${clientBId}`,
                type: 'GENERAL',
                sourceType: 'LOAN_CONVERSION',
                sourceId: loanId,
                lines: [
                    { accountId: receivableAccount.id, debit: totalTransferredAmount, credit: 0, clientId: clientBId },
                    { accountId: receivableAccount.id, debit: 0, credit: totalTransferredAmount, clientId: clientAId },
                ],
            }, userId);

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.id, userId);
            }

            await tx.auditLog.create({
                data: {
                    userId,
                    screen: 'Clients',
                    action: 'UPDATE',
                    description: `قام المستخدم بتحويل السلفة رقم ${loanId} من العميل ${clientAId} إلى العميل ${clientBId}`,
                },
            });
        },);


        await this.updateClientStatus(clientAId);
        await this.updateClientStatus(clientBId);

        return {
            message: 'تم تحويل السلفة بنجاح',
            totalTransferredAmount,
        };
    }

    async transferPartialLoanAmount(
        fromClientId: number,
        toClientId: number,
        loanId: number,
        amountToTransfer: number,
        paymentAmount: number,
        repaymentDay: Date,
        kafeelId: number | null,
        userId: number,
    ) {
        if (amountToTransfer <= 0) {
            throw new BadRequestException('مبلغ التحويل يجب أن يكون أكبر من صفر');
        }

        if (paymentAmount <= 0) {
            throw new BadRequestException('مبلغ الدفعة يجب أن يكون أكبر من صفر');
        }

        const fromClient = await this.prisma.client.findUnique({ where: { id: fromClientId } });
        const toClient = await this.prisma.client.findUnique({
            where: { id: toClientId },
            include: { kafeelS: true },
        });

        if (!fromClient || !toClient) {
            throw new NotFoundException('Client not found');
        }

        if (kafeelId) {
            const valid = toClient.kafeelS.some(k => k.id === kafeelId);
            if (!valid) {
                throw new BadRequestException('الكفيل المختار لا ينتمي إلى العميل المحول إليه');
            }
        }

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                repayments: {
                    where: { remaining: { gt: 0 } },
                    orderBy: { dueDate: 'asc' },
                },
            },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.clientId !== fromClientId) {
            throw new BadRequestException('السلفة لا تنتمي للعميل المصدر');
        }

        const totalRemaining = loan.repayments.reduce((s, r) => s + r.remaining, 0);
        if (amountToTransfer > totalRemaining) {
            throw new BadRequestException('المبلغ المطلوب أكبر من المتبقي على السلفة');
        }


        const principal = new Decimal(amountToTransfer);
        const paymentAmountDecimal = new Decimal(paymentAmount);
        const fullMonths = principal.div(paymentAmountDecimal).floor().toNumber();
        const lastPayment = principal.minus(paymentAmountDecimal.mul(fullMonths));
        const hasRemainder = lastPayment.gt(0);
        const months = hasRemainder ? fullMonths + 1 : fullMonths;


        const interestRate = new Decimal(loan.interestRate || 0).div(100);
        const totalInterest = principal.mul(interestRate);
        const totalAmount = principal.plus(totalInterest);

        if (paymentAmountDecimal.gt(totalAmount)) {
            throw new BadRequestException('مبلغ الدفعة لا يمكن أن يكون أكبر من إجمالي المبلغ');
        }


        let remainingToTransfer = amountToTransfer;
        const splits: {
            repaymentId: number;
            amount: number;
            dueDate: Date;
        }[] = [];

        for (const r of loan.repayments) {
            if (remainingToTransfer <= 0) break;
            const taken = Math.min(r.remaining, remainingToTransfer);
            splits.push({
                repaymentId: r.id,
                amount: taken,
                dueDate: r.dueDate,
            });
            remainingToTransfer -= taken;
        }

        if (!splits.length) {
            throw new BadRequestException('لا يوجد دفعات صالحة للتحويل');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            let actualPrincipal = 0;
            let actualInterest = 0;

            const takenMap = new Map<number, { principal: number; interest: number }>();


            for (const split of splits) {
                const rep = await tx.repayment.findUnique({ where: { id: split.repaymentId } });
                if (!rep) continue;

                const originalRemaining = rep.remaining;
                const originalPrincipal = rep.principalAmount;
                const originalInterest = rep.interestAmount;

                const ratio = new Decimal(split.amount).div(new Decimal(originalRemaining));

                const principalTaken = new Decimal(originalPrincipal).mul(ratio).toDecimalPlaces(2);
                const interestTaken = new Decimal(originalInterest).mul(ratio).toDecimalPlaces(2);

                actualPrincipal += Number(principalTaken);
                actualInterest += Number(interestTaken);

                takenMap.set(rep.id, {
                    principal: Number(principalTaken),
                    interest: Number(interestTaken),
                });


                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        remaining: Number(new Decimal(originalRemaining).minus(split.amount).toDecimalPlaces(2)),
                        principalAmount: Number(new Decimal(originalPrincipal).minus(principalTaken).toDecimalPlaces(2)),
                        interestAmount: Number(new Decimal(originalInterest).minus(interestTaken).toDecimalPlaces(2)),
                        status: split.amount === originalRemaining
                            ? 'PAID'
                            : 'PENDING',
                    },
                });
            }

            actualPrincipal = Number(new Decimal(actualPrincipal).toDecimalPlaces(2));
            actualInterest = Number(new Decimal(actualInterest).toDecimalPlaces(2));
            const totalTransferred = Number(new Decimal(actualPrincipal).plus(actualInterest).toDecimalPlaces(2));


            const newLoan = await tx.loan.create({
                data: {
                    code: `SPLIT-${loan.code}-${Date.now()}`,
                    clientId: toClientId,
                    kafeelId,
                    amount: actualPrincipal,
                    interestRate: loan.interestRate,
                    interestAmount: actualInterest,
                    totalAmount: totalTransferred,
                    generalAmount: loan.generalAmount,
                    newCapitalAmount: loan.newCapitalAmount,
                    generalInterestAmount: loan.generalInterestAmount,
                    newCapitalInterestAmount: loan.newCapitalInterestAmount,
                    paymentAmount: paymentAmount,
                    durationMonths: months,
                    type: loan.type,
                    source: loan.source,
                    status: 'ACTIVE',
                    startDate: new Date(),
                    repaymentDay: repaymentDay,
                    issuanceCity: loan.issuanceCity,
                    paymentCity: loan.paymentCity,
                    partnerId: loan.partnerId,
                    bankAccountId: loan.bankAccountId,
                    fromClientId: fromClientId,
                },
            });

            const lastLoanCount = await tx.loanCount.findFirst({
                orderBy: { count: 'desc' },
            });

            const newCount = lastLoanCount ? lastLoanCount.count + 1 : 1;

            await tx.loanCount.create({
                data: {
                    loanId: newLoan.id,
                    count: newCount,
                },
            });


            let remainingPrincipal = new Decimal(actualPrincipal);
            let remainingInterest = new Decimal(actualInterest);
            const newRepayments: Prisma.RepaymentCreateManyInput[] = [];

            for (let i = 0; i < months; i++) {
                const dueDate = new Date(repaymentDay);

                if (loan.type === LoanType.DAILY) {
                    dueDate.setDate(dueDate.getDate() + i);
                } else if (loan.type === LoanType.WEEKLY) {
                    dueDate.setDate(dueDate.getDate() + (i * 7));
                } else {
                    dueDate.setMonth(dueDate.getMonth() + i);
                }

                let amount = new Decimal(paymentAmount);

                if (i === months - 1 && hasRemainder) {
                    amount = new Decimal(actualPrincipal).minus(new Decimal(paymentAmount).mul(fullMonths));
                }

                let principalAmount: Decimal;
                let interestAmount: Decimal;

                if (remainingPrincipal.plus(remainingInterest).lte(amount)) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                } else {
                    const ratio = remainingPrincipal.div(remainingPrincipal.plus(remainingInterest));
                    principalAmount = amount.mul(ratio).toDecimalPlaces(2);
                    interestAmount = amount.minus(principalAmount).toDecimalPlaces(2);
                }

                remainingPrincipal = remainingPrincipal.minus(principalAmount);
                remainingInterest = remainingInterest.minus(interestAmount);

                const repaymentAmount = Number(principalAmount.plus(interestAmount).toDecimalPlaces(2));

                newRepayments.push({
                    count: i + 1,
                    loanId: newLoan.id,
                    clientId: toClientId,
                    dueDate,
                    amount: repaymentAmount,
                    remaining: repaymentAmount,
                    principalAmount: Number(principalAmount.toDecimalPlaces(2)),
                    interestAmount: Number(interestAmount.toDecimalPlaces(2)),
                    status: 'PENDING',
                });
            }

            await tx.repayment.createMany({ data: newRepayments });


            await tx.loan.update({
                where: { id: loanId },
                data: {
                    amount: { decrement: actualPrincipal },
                    interestAmount: { decrement: actualInterest },
                    totalAmount: { decrement: totalTransferred },
                },
            });


            const receivable = await tx.account.findFirst({
                where: { accountBasicType: 'LOANS_RECEIVABLE' },
            });
            if (!receivable) throw new NotFoundException('Loans receivable account not found');

            const { journal } = await this.journalService.createJournal(
                {
                    reference: `LOAN-SPLIT-${Date.now()}`,
                    description: `تحويل جزئي من السلفة ${loanId}`,
                    type: 'GENERAL',
                    sourceType: 'LOAN_CONVERSION',
                    sourceId: loanId,
                    lines: [
                        { accountId: receivable.id, debit: totalTransferred, credit: 0, clientId: toClientId },
                        { accountId: receivable.id, debit: 0, credit: totalTransferred, clientId: fromClientId },
                    ],
                },
                userId,
            );

            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.id, userId);
            }

            return { newLoanId: newLoan.id };
        });

        await this.updateClientStatus(fromClientId);
        await this.updateClientStatus(toClientId);

        return {
            message: 'تم تحويل جزء من السلفة بنجاح',
            transferredAmount: amountToTransfer,
            newLoanId: result.newLoanId,
        };
    }
}