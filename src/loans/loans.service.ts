import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { JournalSourceType, LoanFundSource, LoanStatus, LoanType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalService } from '../journal/journal.service';
import * as fs from 'fs';
import * as path from 'path';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import moment from "moment-hijri";
import { JournalLineDto } from 'src/journal/dto/journal.dto';
dotenv.config();

@Injectable()
export class LoansService {
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

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    private async handleNewCapitalOnActivation(
        tx: Prisma.TransactionClient,
        loan: any,
        currentUser: number,
    ) {
        const accruals = await tx.partnerShareAccrual.findMany({
            where: {
                loanId: loan.id,
                isClosed: false,
            },
        });

        for (const acc of accruals) {

            const partner = await tx.partner.findUniqueOrThrow({
                where: { id: acc.partnerId },
                select: { upcomingProfit: true },
            });

            const newProfit = new Decimal(partner.upcomingProfit || 0)
                .plus(acc.partnerFinal)
                .toDecimalPlaces(2);
        }

        if (
            loan.source !== LoanFundSource.NEW_CAPITAL &&
            loan.source !== LoanFundSource.MIX
        ) {
            return;
        }

        const shares = await tx.loanNewCapitalShare.findMany({
            where: { loanId: loan.id },
        });

        const lines: JournalLineDto[] = [];

        for (const s of shares) {
            const used = Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2));
            if (used <= 0) continue;

            const partner = await tx.partner.findUniqueOrThrow({
                where: { id: s.partnerId },
            });

            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    isNewPartner: false,
                    capitalAmount: { increment: used },
                    totalAmount: { increment: used },
                },
            });

            lines.push(
                {
                    accountId: partner.accountNewCapitalId,
                    debit: used,
                    credit: 0,
                    description: `تحويل رأس مال شريك إلى العام (قرض ${loan.id})`,
                },
                {
                    accountId: partner.accountEquityId,
                    debit: 0,
                    credit: used,
                    description: `إثبات رأس مال الشريك`,
                },
            );
        }

        if (lines.length === 0) return;

        const journal = await this.journalService.createJournal(
            {
                reference: `LOAN-ACT-${loan.id}`,
                description: `تحويل رأس المال الجديد إلى العام`,
                type: 'GENERAL',
                sourceType: JournalSourceType.LOAN,
                sourceId: loan.id,
                lines,
            },
            currentUser,
        );
    }

    private async handleNewCapitalOnDeactivation(
        tx: Prisma.TransactionClient,
        loanId: number,
    ) {
        const loan = await tx.loan.findUnique({
            where: { id: loanId },
            include: {
                LoanNewCapitalShare: true,
            },
        });

        if (!loan) return;

        const accruals = await tx.partnerShareAccrual.findMany({
            where: {
                loanId,
                isClosed: false,
            },
        });

        for (const acc of accruals) {
            const partner = await tx.partner.findUnique({
                where: { id: acc.partnerId },
                select: { upcomingProfit: true },
            });

            const current = new Decimal(partner?.upcomingProfit || 0);
            const decrement = new Decimal(acc.partnerFinal || 0);

            const updated = Decimal.max(
                new Decimal(0),
                current.minus(decrement)
            ).toDecimalPlaces(2);

            await tx.partner.update({
                where: { id: acc.partnerId },
                data: {
                    upcomingProfit: Number(updated),
                },
            });
        }

        if (
            loan.source !== LoanFundSource.NEW_CAPITAL &&
            loan.source !== LoanFundSource.MIX
        ) {
            return;
        }

        for (const s of loan.LoanNewCapitalShare) {
            const used = Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2));
            if (used <= 0) continue;

            const partner = await tx.partner.findUnique({
                where: { id: s.partnerId },
                select: { capitalAmount: true },
            });

            const remainingCapital = Number(partner?.capitalAmount || 0) - used;

            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    capitalAmount: { decrement: used },
                    totalAmount: { decrement: used },
                    isNewPartner: remainingCapital <= 0,
                },
            });
        }
    }

    async getLoanCountById(id: number) {
        const loanCount = await this.prisma.loanCount.findFirst({
            where: { loanId: id },
            select: { loanId: true, count: true }
        });
        if (!loanCount) throw new NotFoundException('Loan count not found');
        return loanCount;
    }

    async createLoan(currentUser, dto: CreateLoanDto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const principal = new Decimal(dto.amount);
        let totalInterest: Decimal;
        let totalAmount: Decimal;
        let interestRate: Decimal | undefined;

        if (dto.TotalInterest != null) {
            totalInterest = new Decimal(dto.TotalInterest);
            totalAmount = principal.plus(totalInterest);
            interestRate = totalInterest.div(principal).mul(100);
        } else if (dto.InterestPercentage != null) {
            interestRate = new Decimal(dto.InterestPercentage);
            totalAmount = principal.mul(interestRate.div(100).add(1));
            totalInterest = totalAmount.minus(principal);
        } else {
            totalInterest = new Decimal(0);
            interestRate = new Decimal(0);
            totalAmount = principal;
        }

        let fundSource = dto.source;

        let generalAmount = new Decimal(0);
        let newCapitalAmount = new Decimal(0);

        if (fundSource === LoanFundSource.GENERAL) {
            generalAmount = principal;
        }

        if (fundSource === LoanFundSource.NEW_CAPITAL) {
            newCapitalAmount = principal;
        }

        if (fundSource === LoanFundSource.MIX) {
            const bankAccount = await this.prisma.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });
            if (!bankAccount) {
                throw new NotFoundException('Bank account not found');
            }

            const bankBalance = new Decimal(bankAccount.balance);

            if (bankBalance.gte(principal)) {
                generalAmount = principal;
            } else {
                generalAmount = bankBalance;
                newCapitalAmount = principal.minus(bankBalance);
            }
        }

        if (generalAmount.gt(0)) {
            const generalPartners = await this.prisma.partner.findMany({
                where: {
                    isActive: true,
                    joinDistribute: true,
                    isNewPartner: false
                },
            });

            const bank = await this.prisma.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });
            if (!bank) throw new NotFoundException('Bank account not found');

            const balance = new Decimal(bank.balance);

            if (balance.lt(generalAmount)) {
                throw new BadRequestException(
                    `رصيد رأس المال غير كافٍ. المطلوب: ${generalAmount.toFixed(2)}`
                );
            }
        }

        if (newCapitalAmount.gt(0)) {

            const newCapitalBank = await this.prisma.account.findUnique({
                where: { code: '11001' },
            });

            if (!newCapitalBank) {
                throw new NotFoundException('حساب رأس المال الجديد (11001) غير موجود');
            }

            const balance = new Decimal(newCapitalBank.balance);

            if (balance.lt(newCapitalAmount)) {
                throw new BadRequestException(
                    `رصيد رأس المال الجديد غير كافٍ. المطلوب: ${newCapitalAmount.toFixed(2)}`
                );
            }
        }

        if (fundSource === LoanFundSource.GENERAL) {
            const bank = await this.prisma.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });
            if (!bank) throw new NotFoundException('Bank account not found');
            if (principal.gt(new Decimal(bank.balance))) {
                throw new BadRequestException('السلفة أكبر من رصيد البنك المتاح');
            }
        }

        if (dto.partnerId) {
            const partnerCheck = await this.prisma.partner.findUnique({
                where: { id: dto.partnerId },
                select: { joinDistribute: true },
            });

            if (partnerCheck?.joinDistribute === false) throw new NotFoundException('هذا المستثمر لا يمكن دخوله في التوزيع');
        }

        const interestRatio = interestRate.div(100);

        const generalInterestAmount = generalAmount.gt(0)
            ? generalAmount.mul(interestRatio)
            : new Decimal(0);

        const newCapitalInterestAmount = newCapitalAmount.gt(0)
            ? newCapitalAmount.mul(interestRatio)
            : new Decimal(0);

        const paymentAmount = new Decimal(dto.paymentAmount);

        const bankAccount = await this.prisma.bANK_accounts.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount) throw new NotFoundException('Bank account not found');
        if (bankAccount.limit <= 0) throw new BadRequestException('انتهى الحد المسموح للحساب البنكي');


        const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths;
        const hasRemainder = lastPayment.gt(0);


        if (dto.kafeelId) {
            const kafeel = await this.prisma.kafeel.findUnique({
                where: { id: dto.kafeelId },
                include: { loans: true },
            });
            if (!kafeel) throw new NotFoundException('Kafeel not found');

            if (kafeel.clientId !== dto.clientId) {
                throw new BadRequestException('This Kafeel is not associated with the selected client.');
            }
        }

        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const clientIdStr = String(client.id).padStart(3, '0');
        const code = `LN - ${datePart} - ${clientIdStr}`;


        const loan = await this.prisma.loan.create({
            data: {
                code,
                clientId: dto.clientId,
                kafeelId: dto.kafeelId ?? null,
                amount: Number(principal.toFixed(2)),
                interestRate: Number(interestRate.toFixed(2)),
                interestAmount: Number(totalInterest.toFixed(2)),
                totalAmount: Number(totalAmount.toFixed(2)),
                paymentAmount: Number(paymentAmount.toFixed(2)),
                generalAmount: Number(generalAmount.toFixed(2)),
                newCapitalAmount: Number(newCapitalAmount.toFixed(2)),
                generalInterestAmount: Number(generalInterestAmount.toFixed(2)),
                newCapitalInterestAmount: Number(newCapitalInterestAmount.toFixed(2)),
                durationMonths: months,
                type: dto.type,
                source: fundSource,
                startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
                createdAt: dto.startDate ? new Date(dto.startDate) : new Date(),
                promissionaryDate: dto.promissionaryDate ? new Date(dto.promissionaryDate) : new Date(),
                status: LoanStatus.PENDING,
                repaymentDay: dto.repaymentDay ? new Date(dto.repaymentDay) : new Date(),
                bankAccountId: dto.bankAccountId,
                partnerId: dto.partnerId,
                issuanceCity: dto.issuanceCity,
                paymentCity: dto.paymentCity,
            },
        });

        const lastLoanCount = await this.prisma.loanCount.findFirst({
            orderBy: { count: 'desc' },
        });

        const newCount = lastLoanCount ? lastLoanCount.count + 1 : 1;

        await this.prisma.loanCount.create({
            data: {
                loanId: loan.id,
                count: newCount,
            },
        });

        if (
            (fundSource === LoanFundSource.GENERAL || fundSource === LoanFundSource.MIX) &&
            generalAmount.gt(0)
        ) {
            const partners = await this.prisma.partner.findMany({
                where: {
                    isActive: true,
                    joinDistribute: true,
                    totalAmount: { gt: 0 }
                },
                select: { id: true, totalAmount: true, orgProfitPercent: true, yearlyZakatBalance: true },
            });

            const totalCapital = partners.reduce(
                (sum, p) => sum + p.totalAmount,
                0,
            );

            for (const p of partners) {
                const percent =
                    totalCapital > 0
                        ? (p.totalAmount / totalCapital) * 100
                        : 0;

                await this.prisma.loanPartnerShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.id,
                        sharePercent: percent,
                        orgProfitPercent: p.orgProfitPercent,
                        isActive: true,
                    },
                });
            }
        }

        if (
            (fundSource === LoanFundSource.NEW_CAPITAL || fundSource === LoanFundSource.MIX) &&
            newCapitalAmount.gt(0)
        ) {
            const partners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
                include: { Partner: true },
                orderBy: { remaining: 'desc' },
            });

            const totalNewCapital = partners.reduce(
                (sum, p) => sum.plus(p.remaining),
                new Decimal(0),
            );

            console.log('newCapitalAmount:', newCapitalAmount.toString());
            console.log('totalNewCapital:', totalNewCapital.toString());

            if (newCapitalAmount.gt(totalNewCapital)) {
                throw new BadRequestException(
                    `المبلغ المطلوب (${newCapitalAmount}) أكبر من رأس المال الجديد المتاح (${totalNewCapital})`
                );
            }

            let distributed = new Decimal(0);

            for (let i = 0; i < partners.length; i++) {
                const p = partners[i];

                const usedAmount =
                    i === partners.length - 1
                        ? newCapitalAmount.minus(distributed)
                        : newCapitalAmount
                            .mul(new Decimal(p.remaining).div(totalNewCapital))
                            .toDecimalPlaces(2);

                distributed = distributed.plus(usedAmount);

                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: Number(usedAmount),
                        percent: Number(
                            usedAmount.div(newCapitalAmount).mul(100)
                        ),
                        orgProfitPercent: p.Partner.orgProfitPercent,
                    },
                });

                const currentPartner = await this.prisma.partnerNewCapital.findUnique({
                    where: { id: p.id },
                    select: { remaining: true },
                });

                const currentRemaining = new Decimal(currentPartner?.remaining || 0);
                const usedDecimal = new Decimal(usedAmount);
                const newRemaining = Decimal.max(0, currentRemaining.minus(usedDecimal))
                    .toDecimalPlaces(2);

                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: Number(newRemaining),
                    },
                });
            }
        }

        const account = await this.prisma.bANK_accounts.update({
            where: { id: dto.bankAccountId },
            data: { limit: { decrement: 1 } },
            select: { limit: true },
        });
        if (account.limit <= 0) {
            await this.prisma.bANK_accounts.update({
                where: { id: dto.bankAccountId },
                data: { status: 'Expired' },
            });
        }

        const repayments: Prisma.RepaymentCreateManyInput[] = [];
        const firstRepaymentDate = dto.repaymentDay
            ? new Date(dto.repaymentDay)
            : (() => {
                throw new BadRequestException('يجب تحديد تاريخ أول دفعة');
            })();


        let remainingPrincipal = principal;
        let remainingInterest = totalInterest;

        for (let i = 0; i < months; i++) {
            const dueDate = new Date(firstRepaymentDate);

            if (dto.type === LoanType.DAILY) {
                dueDate.setDate(firstRepaymentDate.getDate() + i);
            }
            else if (dto.type === LoanType.WEEKLY) {
                dueDate.setDate(firstRepaymentDate.getDate() + i * 7);
            }
            else {
                dueDate.setMonth(firstRepaymentDate.getMonth() + i);
            }

            let amount = paymentAmount;
            if (i === months - 1 && lastPayment.gt(0)) {
                amount = paymentAmount.plus(lastPayment);
            }

            let principalAmount: Decimal;
            let interestAmount: Decimal;

            if (i === months && lastPayment.gt(0)) {
                principalAmount = remainingPrincipal;
                interestAmount = remainingInterest;
            } else {
                const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                interestAmount = amount.mul(interestRatio).toDecimalPlaces(2);
                principalAmount = amount.minus(interestAmount).toDecimalPlaces(2);
            }

            remainingPrincipal = remainingPrincipal.minus(principalAmount);
            remainingInterest = remainingInterest.minus(interestAmount);

            repayments.push({
                count: i + 1,
                loanId: loan.id,
                clientId: dto.clientId,
                dueDate,
                amount: Number(amount.toFixed(2)),
                remaining: Number(amount.toFixed(2)),
                principalAmount: Number(principalAmount.toFixed(2)),
                interestAmount: Number(interestAmount.toFixed(2)),
                status: 'PENDING',
            });
        }

        await this.prisma.repayment.createMany({ data: repayments });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء سلفة جديدة للعميل ${client.name} بمبلغ ${dto.amount}`,
            },
        });


        const loanWithIncludes = await this.prisma.loan.findUnique({
            where: { id: loan.id },
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { name: true, nationalId: true, birthDate: true } },
                LoanPartnerShare: { select: { partnerId: true, sharePercent: true } },
                LoanNewCapitalShare: { select: { partnerId: true, amountUsed: true, percent: true } },
            },
        });

        return { message: 'تم انشاء السلفة بنجاح', loan: loanWithIncludes };
    }

    async activateLoan(id: number, userId: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
                client: { select: { id: true } },
                LoanPartnerShare: { include: { partner: true } },
                LoanNewCapitalShare: true,
            },
        });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن تفعيلها');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });


        if (!loan.repayments || loan.repayments.length === 0) {
            const principal = new Decimal(loan.amount);
            const totalInterest = new Decimal(loan.interestAmount);
            const totalAmount = new Decimal(loan.totalAmount);
            const paymentAmount = new Decimal(loan.paymentAmount);


            const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
            const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
            let months = fullMonths;
            const hasRemainder = lastPayment.gt(0);

            const repayments: Prisma.RepaymentCreateManyInput[] = [];
            const firstRepaymentDate = loan.repaymentDay || new Date();

            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;

            for (let i = 0; i < months; i++) {
                const dueDate = new Date(firstRepaymentDate);

                if (loan.type === LoanType.DAILY) {
                    dueDate.setDate(firstRepaymentDate.getDate() + i);
                } else if (loan.type === LoanType.WEEKLY) {
                    dueDate.setDate(firstRepaymentDate.getDate() + i * 7);
                } else {
                    dueDate.setMonth(firstRepaymentDate.getMonth() + i);
                }

                let amount = paymentAmount;
                if (i === months - 1 && hasRemainder) {
                    amount = paymentAmount.plus(lastPayment);
                }

                let principalAmount: Decimal;
                let interestAmount: Decimal;

                if (i === months && hasRemainder) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                } else {
                    const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                    interestAmount = amount.mul(interestRatio).toDecimalPlaces(2);
                    principalAmount = amount.minus(interestAmount).toDecimalPlaces(2);
                }

                remainingPrincipal = remainingPrincipal.minus(principalAmount);
                remainingInterest = remainingInterest.minus(interestAmount);

                repayments.push({
                    count: i + 1,
                    loanId: loan.id,
                    clientId: loan.clientId,
                    dueDate,
                    amount: Number(amount.toFixed(2)),
                    remaining: Number(amount.toFixed(2)),
                    principalAmount: Number(principalAmount.toFixed(2)),
                    interestAmount: Number(interestAmount.toFixed(2)),
                    status: 'PENDING',
                });
            }

            await this.prisma.repayment.createMany({ data: repayments });
        }

        const receivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });

        if (!receivable)
            throw new BadRequestException('Loan receivable account must exist');

        let creditAccount;
        let journalLines: any[] = [];

        if (loan.source === LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
            journalLines = [
                { accountId: receivable.id, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
                { accountId: creditAccount.id, debit: 0, credit: loan.amount, description: 'سلفة عميل' },
            ];
        } else if (loan.source === LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
            journalLines = [
                { accountId: receivable.id, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
                { accountId: creditAccount.id, debit: 0, credit: loan.amount, description: 'سلفة عميل' },
            ];
        } else if (loan.source === LoanFundSource.MIX) {
            const newCapitalBank = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
            const generalBank = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });

            journalLines.push(
                { accountId: newCapitalBank.id, debit: 0, credit: loan.newCapitalAmount, description: 'تحويل من رأس المال الجديد إلى البنك' },
                { accountId: generalBank.id, debit: loan.newCapitalAmount, credit: 0, description: 'تحويل من رأس المال الجديد إلى البنك' },
            );

            journalLines.push(
                { accountId: receivable.id, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
                { accountId: generalBank.id, debit: 0, credit: loan.amount, description: 'سلفة عميل' },
            );

            creditAccount = generalBank;
        }

        const { journal } = await this.journalService.createJournal(
            {
                reference: `LN - ${loan.id}`,
                description: `صرف سلفة للعميل ${loan.clientId}`,
                type: 'GENERAL',
                sourceType: JournalSourceType.LOAN,
                sourceId: loan.id,
                lines: journalLines,
            },
            userId,
        );

        const clientjournal = await this.journalService.createJournal({
            reference: `int - ${loan.id}`,
            description: `تحويل فوائد سلفة للعميل ${loan.clientId} إلى حسابه`,
            type: 'GENERAL',
            sourceType: 'LOAN_INTEREST',
            sourceId: loan.id,
            lines: [
                { accountId: receivable.id, debit: loan.interestAmount, credit: 0, clientId: loan.clientId },
                { accountId: receivable.id, debit: 0, credit: loan.interestAmount },
            ],
        }, userId);

        await this.prisma.loan.update({
            where: { id },
            data: {
                status: LoanStatus.ACTIVE,
                disbursementJournalId: journal.id,
            },
        });

        await this.prisma.$transaction(async (tx) => {
            await this.handleNewCapitalOnActivation(
                tx,
                loan,
                userId,
            );
        });


        await this.updateClientStatus(loan.clientId);

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Loans',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتفعيل السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
            },
        });

        return {
            message: 'تم تفعيل السلفة بنجاح',
            loanId: id,
            journalId: journal.id,
        };
    }

    async deactivateLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
            },
        });

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.ACTIVE)
            throw new BadRequestException('فقط السلف النشطة يمكن إلغاء تفعيلها');

        return await this.prisma.$transaction(async (tx) => {

            const repaymentIds = loan.repayments.map(r => r.id);


            const repaymentJournalIds = (
                await tx.journalHeader.findMany({
                    where: {
                        sourceType: JournalSourceType.REPAYMENT,
                        sourceId: { in: repaymentIds.length > 0 ? repaymentIds : undefined },
                    },
                    select: { id: true },
                })
            ).map(j => j.id);

            const loanJournalIds = [loan.disbursementJournalId, loan.settlementJournalId].filter(Boolean) as number[];

            const interestJournal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: 'LOAN_INTEREST',
                    sourceId: loan.id,
                },
                select: { id: true },
            });

            const activateJournal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: 'LOAN',
                    sourceId: loan.id,
                    reference: { contains: 'ACT' },
                },
                select: { id: true },
            });


            const allJournalIds = [
                ...loanJournalIds,
                ...repaymentJournalIds,
                ...(interestJournal ? [interestJournal.id] : []),
                ...(activateJournal ? [activateJournal.id] : []),
            ];

            if (allJournalIds.length > 0) {

                for (const journalId of allJournalIds) {
                    try {
                        await this.journalService.unpostJournal(currentUser, journalId);
                    } catch (e) {
                        console.warn(`⚠️ Skipped unposting journal ${journalId}: `, e.message);
                    }
                }

                await tx.journalLine.deleteMany({
                    where: { journalId: { in: allJournalIds } },
                });
                await tx.journalHeader.deleteMany({
                    where: { id: { in: allJournalIds } },
                });
            }

            if (repaymentIds.length > 0) {
                await tx.repaymentCount.deleteMany({
                    where: { repaymentId: { in: repaymentIds } },
                });
            }

            const repaymentPayments = await tx.repaymentPayment.findMany({
                where: {
                    repaymentId: { in: repaymentIds },
                },
                select: {
                    proofUrl: true,
                },
            });

            for (const payment of repaymentPayments) {
                if (!payment.proofUrl) continue;

                try {
                    const urlPath = new URL(payment.proofUrl).pathname;
                    const localPath = path.join(
                        process.cwd(),
                        urlPath.replace(/^\//, '')
                    );

                    if (fs.existsSync(localPath)) {
                        fs.unlinkSync(localPath);
                    }
                } catch (e) {
                }
            }

            await tx.repaymentPayment.deleteMany({
                where: {
                    repaymentId: { in: repaymentIds },
                },
            });

            await tx.repayment.deleteMany({ where: { loanId: id } });

            await tx.loan.update({
                where: { id },
                data: {
                    status: LoanStatus.PENDING,
                    disbursementJournalId: null,
                    settlementJournalId: null,
                },
            });

            await this.updateClientStatus(loan.clientId);

            await this.handleNewCapitalOnDeactivation(tx, id);

            await tx.partnerShareAccrual.deleteMany({ where: { loanId: id } });


            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بإلغاء تفعيل السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
                },
            });

            return {
                message: 'تم إلغاء تفعيل السلفة بنجاح',
                loanId: id,
                deletedJournalsCount: allJournalIds.length,
            };
        });
    }


    async getAllLoans(page: number = 1, limit = 10, filters?: any) {
        const where: any = {};

        if (filters?.status) where.status = filters.status;
        if (filters?.code) where.code = { contains: filters.code, mode: 'insensitive' };
        if (filters?.clientId) where.clientId = filters.clientId;
        if (filters?.clientName) {
            where.client = { name: { contains: filters.clientName, mode: 'insensitive' } };
        }
        if (filters?.bankAccountName)
            where.bankAccount = { name: { contains: filters.bankAccountName, mode: 'insensitive' } };
        if (filters?.partnerName)
            where.partner = { name: { contains: filters.partnerName, mode: 'insensitive' } };

        const unformattedLoans = await this.prisma.loan.findMany({
            where,
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { id: true, name: true } },
                fromclient: { select: { id: true, name: true } }
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const loans = await Promise.all(unformattedLoans.map(async (loan) => {
            const createdAt = loan.createdAt ? new Date(loan.createdAt) : null;
            const startDate = loan.startDate ? new Date(loan.startDate) : null;
            const endDate = loan.endDate ? new Date(loan.endDate) : null;
            const repaymentDay = loan.repaymentDay ? new Date(loan.repaymentDay) : null;


            const allRepaymentsAggregation = await this.prisma.repayment.aggregate({
                where: { loanId: loan.id },
                _sum: {
                    paidAmount: true,
                    remaining: true,
                },
            });

            const totalPaidAmount = Number(allRepaymentsAggregation._sum.paidAmount || 0);
            const totalRemainingAmount = Number(allRepaymentsAggregation._sum.remaining || 0);
            const remainingBalance = Math.max(0, totalRemainingAmount);

            const repaymentPayments = await this.prisma.repaymentPayment.findMany({
                where: {
                    repayment: {
                        loanId: loan.id,
                    },
                },
                select: {
                    proofUrl: true,
                },
            });

            const PAYMENT_PROOF = repaymentPayments
                .map(p => p.proofUrl)
                .filter(Boolean);

            return {
                ...loan,
                createdAt: createdAt
                    ? DateTime.fromJSDate(createdAt).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd HH:mm:ss')
                    : null,
                startDate: startDate
                    ? DateTime.fromJSDate(startDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                endDate: endDate
                    ? DateTime.fromJSDate(endDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                repaymentDay: repaymentDay
                    ? DateTime.fromJSDate(repaymentDay).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,


                createdAtHijri: createdAt ? this.toHijri(createdAt) : null,
                startDateHijri: startDate ? this.toHijri(startDate) : null,
                endDateHijri: endDate ? this.toHijri(endDate) : null,
                repaymentDayHijri: repaymentDay ? this.toHijri(repaymentDay) : null,


                remainingBalance: remainingBalance,
                totalPaidAmount: totalPaidAmount,
                totalRemainingAmount: totalRemainingAmount,


                PAYMENT_PROOF,
            };
        }));

        const total = await this.prisma.loan.count({ where });
        return { total, page, limit, data: loans };
    }

    async getLoanById(id: number, page: number, limit: number = 10) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { name: true, nationalId: true, birthDate: true } },
                LoanPartnerShare: { select: { partnerId: true, sharePercent: true } },
                LoanNewCapitalShare: { select: { partnerId: true, amountUsed: true, percent: true } },
                fromclient: { select: { id: true, name: true } }
            },
        });
        if (!loan) throw new NotFoundException('Loan not found');


        const totalRepayments = await this.prisma.repayment.count({
            where: { loanId: id },
        });


        const paidRepayments = await this.prisma.repayment.count({
            where: {
                loanId: id,
                status: { in: ['PAID', 'EARLY_PAID'] }
            },
        });


        const allRepaymentsAggregation = await this.prisma.repayment.aggregate({
            where: { loanId: id },
            _sum: {
                paidAmount: true,
                remaining: true,
            },
        });

        const totalPaidAmount = Number(allRepaymentsAggregation._sum.paidAmount || 0);
        const totalRemainingAmount = Number(allRepaymentsAggregation._sum.remaining || 0);


        const Repayments = await this.prisma.repayment.findMany({
            where: { loanId: id },
            orderBy: { dueDate: 'asc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                count: true,
                loanId: true,
                clientId: true,
                dueDate: true,
                amount: true,
                remaining: true,
                paidAmount: true,
                principalAmount: true,
                interestAmount: true,
                status: true,
                paymentDate: true,
                attachments: true,
                PaymentProof: true,
                reviewStatus: true,
                notes: true,
                postponeApproved: true,
                postponeReason: true,
                newDueDate: true,
                createdAt: true,
                discount: true,
                RepaymentPayment: {
                    select: { repaymentId: true, proofUrl: true }
                }
            },
        });

        const toSaudiTime = (date: Date | null | undefined) =>
            date
                ? DateTime.fromJSDate(date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null;

        const toDateOnly = (date: Date | null | undefined) =>
            date ? DateTime.fromJSDate(date).toFormat('yyyy-LL-dd') : null;

        const toSaudiHijri = (date: Date | null | undefined) =>
            date
                ? this.toHijri(DateTime.fromJSDate(date).setZone('Asia/Riyadh').toJSDate())
                : null;

        const getpartnername = async (partnerId: number) => {
            const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
            return {
                name: partner?.name ?? 'Unknown',
                nationalId: partner?.nationalId ?? 'N/A',
            };
        };

        const loanPartnerShareName = await Promise.all(
            loan.LoanPartnerShare.map(async (share) => {
                const partnerInfo = await getpartnername(share.partnerId);
                return {
                    ...share,
                    ...partnerInfo,
                };
            })
        );

        const loanPartnerNewShareName = await Promise.all(
            loan.LoanNewCapitalShare.map(async (share) => {
                const partnerInfo = await getpartnername(share.partnerId);
                return {
                    ...share,
                    ...partnerInfo,
                };
            })
        );

        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;

        const formattedRepayments = Repayments.map((repayment) => {
            const remainingPrincipal = Number(
                Math.max(repayment.principalAmount - repayment.paidAmount, 0).toFixed(2)
            );

            const remainingInterest = Number(
                (
                    repayment.amount -
                    repayment.principalAmount -
                    Math.max(repayment.paidAmount - repayment.principalAmount, 0)
                ).toFixed(2)
            );

            totalRemainingPrincipal += remainingPrincipal;
            totalRemainingInterest += remainingInterest;

            return {
                ...repayment,
                dueDate: toSaudiTime(repayment.dueDate),
                paymentDate: toSaudiTime(repayment.paymentDate),
                newDueDate: toSaudiTime(repayment.newDueDate),
                createdAt: toSaudiTime(repayment.createdAt),
                dueDateHijri: toSaudiHijri(repayment.dueDate),
                paymentDateHijri: toSaudiHijri(repayment.paymentDate),
                newDueDateHijri: toSaudiHijri(repayment.newDueDate),
                createdAtHijri: toSaudiHijri(repayment.createdAt),
                remainingPrincipal,
                remainingInterest,
                amount: Number(repayment.amount.toFixed(2)),
                principalAmount: Number(repayment.principalAmount.toFixed(2)),
                interestAmount: Number(repayment.interestAmount.toFixed(2)),
                paidAmount: Number(repayment.paidAmount.toFixed(2)),
            };
        });

        const totalDue = Number((totalRemainingPrincipal + totalRemainingInterest).toFixed(2));
        totalRemainingPrincipal = Number(totalRemainingPrincipal.toFixed(2));
        totalRemainingInterest = Number(totalRemainingInterest.toFixed(2));

        return {
            ...loan,
            createdAtHijri: toSaudiHijri(loan.createdAt),
            startDateHijri: loan.startDate ? toSaudiHijri(loan.startDate) : null,
            endDateHijri: loan.endDate ? toSaudiHijri(loan.endDate) : null,

            pagination: {
                totalPages: Math.ceil(totalRepayments / limit),
                limit,
                page,
                totalRepayments: totalRepayments,
                paidRepayments: paidRepayments,
                totalPaidAmount: totalPaidAmount,
                totalRemainingAmount: totalRemainingAmount,
            },
            repayments: formattedRepayments,
            loanPartnerShare: loanPartnerShareName,
            loanNewCapitalShare: loanPartnerNewShareName,
            totalRemainingPrincipal,
            totalRemainingInterest,
            totalDue,

            client: {
                ...loan.client,
                birthDate: toDateOnly(loan.client.birthDate),
            },
            kafeel: loan.kafeel
                ? {
                    ...loan.kafeel,
                    birthDate: toDateOnly(loan.kafeel.birthDate),
                }
                : null,
        };
    }


    async updateLoan(currentUser, id: number, dto: UpdateLoanDto) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { LoanPartnerShare: true, LoanNewCapitalShare: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن تعديلها');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const loanUpdateData: any = {};


        if (dto.amount !== undefined) loanUpdateData.amount = dto.amount;
        if (dto.paymentAmount !== undefined) loanUpdateData.paymentAmount = dto.paymentAmount;
        if (dto.type !== undefined) loanUpdateData.type = dto.type;
        if (dto.startDate !== undefined) loanUpdateData.startDate = new Date(dto.startDate);
        if (dto.promissionaryDate !== undefined) loanUpdateData.promissionaryDate = new Date(dto.promissionaryDate);
        if (dto.repaymentDay !== undefined) {
            loanUpdateData.repaymentDay = new Date(dto.repaymentDay);
        }
        if (dto.bankAccountId !== undefined) loanUpdateData.bankAccountId = dto.bankAccountId;
        if (dto.partnerId !== undefined) loanUpdateData.partnerId = dto.partnerId;
        if (dto.clientId !== undefined) loanUpdateData.clientId = dto.clientId;
        if (dto.kafeelId !== undefined) loanUpdateData.kafeelId = dto.kafeelId;
        if (dto.issuanceCity !== undefined) loanUpdateData.issuanceCity = dto.issuanceCity;
        if (dto.paymentCity !== undefined) loanUpdateData.paymentCity = dto.paymentCity;
        if (dto.InterestPercentage !== undefined) {
            loanUpdateData.interestRate = dto.InterestPercentage;
        }

        if (dto.TotalInterest !== undefined) {
            loanUpdateData.interestAmount = dto.TotalInterest;
        }

        const updated = await this.prisma.loan.update({
            where: { id },
            data: loanUpdateData,
        });

        const sourceChanged =
            dto.source !== undefined &&
            dto.source !== loan.source;

        if (sourceChanged && loan.source === LoanFundSource.GENERAL && dto.source === LoanFundSource.NEW_CAPITAL) {
            await this.prisma.loanPartnerShare.deleteMany({
                where: { loanId: loan.id },
            });

            const newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
                include: { Partner: true }
            });

            if (newCapitalPartners.length === 0) {
                throw new BadRequestException('لا يوجد رأس مال جديد متاح');
            }

            const principal = new Decimal(dto.amount ? dto.amount : loan.amount);
            const totalNewCapital = newCapitalPartners.reduce(
                (sum, p) => sum.plus(p.remaining),
                new Decimal(0),
            );

            if (totalNewCapital.lt(principal)) {
                throw new BadRequestException('رأس المال الجديد غير كافٍ');
            }

            for (const p of newCapitalPartners) {
                const ratio = new Decimal(p.remaining).div(totalNewCapital);
                const usedAmount = principal.mul(ratio).toDecimalPlaces(2);

                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: Number(usedAmount),
                        percent: Number(ratio.mul(100).toFixed(2)),
                        orgProfitPercent: p.Partner.orgProfitPercent,
                    },
                });

                const currentPartner = await this.prisma.partnerNewCapital.findUnique({
                    where: { id: p.id },
                    select: { remaining: true },
                });
                const newRemaining = Math.max(0, Number(currentPartner?.remaining || 0) - Number(usedAmount));

                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: newRemaining,
                    },
                });
            }
        }

        if (sourceChanged && loan.source === LoanFundSource.NEW_CAPITAL && dto.source === LoanFundSource.GENERAL) {

            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });

            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }

            await this.prisma.loanNewCapitalShare.deleteMany({
                where: { loanId: loan.id },
            });

            const partners = await this.prisma.partner.findMany({
                where: { isNewPartner: false },
            });

            const totalCapital = partners.reduce((sum, p) => sum + p.totalAmount, 0);

            for (const p of partners) {
                const percent = totalCapital > 0 ? (p.totalAmount / totalCapital) * 100 : 0;

                await this.prisma.loanPartnerShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.id,
                        sharePercent: Number(percent.toFixed(2)),
                        orgProfitPercent: p.orgProfitPercent,
                        isActive: true,
                    },
                });
            }
        }


        if (dto.amount || dto.InterestPercentage || dto.TotalInterest || dto.type || dto.repaymentDay || dto.startDate) {

            await this.prisma.repayment.deleteMany({ where: { loanId: id } });


            const principal = new Decimal(dto.amount || updated.amount);
            let totalInterest: Decimal;
            let totalAmount: Decimal;
            let interestRate: Decimal;

            if (dto.TotalInterest != null) {
                totalInterest = new Decimal(dto.TotalInterest);
                totalAmount = principal.plus(totalInterest);
                interestRate = totalInterest.div(principal).mul(100);
            } else if (dto.InterestPercentage != null) {
                interestRate = new Decimal(dto.InterestPercentage);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            } else if (updated.interestRate != null) {
                interestRate = new Decimal(updated.interestRate);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            } else {
                throw new BadRequestException('يجب ادخال مبلغ او نسبة الفائدة');
            }


            const financialUpdateData: any = {
                amount: Number(principal.toFixed(2)),
                interestRate: Number(interestRate.toFixed(2)),
                interestAmount: Number(totalInterest.toFixed(2)),
                totalAmount: Number(totalAmount.toFixed(2)),
                startDate: dto.startDate ? new Date(dto.startDate) : loan.startDate,
            };


            if (dto.kafeelId !== undefined) {
                financialUpdateData.kafeelId = dto.kafeelId;
            }

            await this.prisma.loan.update({
                where: { id },
                data: financialUpdateData,
            });


            const paymentAmount = new Decimal(dto.paymentAmount || updated.paymentAmount);


            const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
            const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
            const months = fullMonths;
            const hasRemainder = lastPayment.gt(0);

            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;

            const repayments: Prisma.RepaymentCreateManyInput[] = [];
            const firstDate = dto.repaymentDay ?
                new Date(dto.repaymentDay) :
                loan.repaymentDay ?
                    new Date(loan.repaymentDay) : new Date();

            for (let i = 1; i <= months; i++) {
                let dueDate: Date;

                if (updated.type === LoanType.DAILY) {
                    dueDate = new Date(firstDate);
                    dueDate.setUTCDate(firstDate.getUTCDate() + (i - 1));
                }
                else if (updated.type === LoanType.WEEKLY) {
                    dueDate = new Date(firstDate);
                    dueDate.setUTCDate(firstDate.getUTCDate() + (i - 1) * 7);
                }
                else {
                    dueDate = new Date(Date.UTC(
                        firstDate.getUTCFullYear(),
                        firstDate.getUTCMonth() + (i - 1),
                        firstDate.getUTCDate(),
                        0, 0, 0, 0
                    ));
                }

                let amount = paymentAmount;
                if (i === months && hasRemainder) {
                    amount = paymentAmount.plus(lastPayment);
                }

                let principalAmount: Decimal;
                let interestAmount: Decimal;

                if (i === months && hasRemainder) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                } else {
                    const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                    interestAmount = amount.mul(interestRatio).toDecimalPlaces(2);
                    principalAmount = amount.minus(interestAmount).toDecimalPlaces(2);
                }

                remainingPrincipal = remainingPrincipal.minus(principalAmount);
                remainingInterest = remainingInterest.minus(interestAmount);

                repayments.push({
                    loanId: id,
                    count: i,
                    clientId: dto.clientId || updated.clientId,
                    dueDate,
                    amount: Number(amount.toFixed(2)),
                    remaining: Number(amount.toFixed(2)),
                    principalAmount: Number(principalAmount.toFixed(2)),
                    interestAmount: Number(interestAmount.toFixed(2)),
                    status: 'PENDING',
                });
            }

            await this.prisma.repayment.createMany({ data: repayments });
        }

        if (
            dto.amount &&
            dto.amount !== loan.amount &&
            loan.source === LoanFundSource.NEW_CAPITAL
        ) {

            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });

            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }

            const principal = new Decimal(dto.amount);

            const newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
                include: { Partner: true }
            });

            if (newCapitalPartners.length === 0) {
                throw new BadRequestException('لا يوجد رأس مال جديد متاح بعد التعديل');
            }

            const totalNewCapital = newCapitalPartners.reduce(
                (sum, p) => sum.plus(p.remaining),
                new Decimal(0),
            );

            if (totalNewCapital.lt(principal)) {
                throw new BadRequestException('رأس المال الجديد غير كافٍ بعد تعديل المبلغ');
            }

            await this.prisma.loanNewCapitalShare.deleteMany({
                where: { loanId: loan.id },
            });

            for (const p of newCapitalPartners) {
                const ratio = new Decimal(p.remaining).div(totalNewCapital);
                const usedAmount = principal.mul(ratio).toDecimalPlaces(2);

                if (usedAmount.lte(0)) continue;

                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: Number(usedAmount),
                        percent: Number(ratio.mul(100).toFixed(2)),
                        orgProfitPercent: p.Partner.orgProfitPercent,
                    },
                });

                const currentPartner = await this.prisma.partnerNewCapital.findUnique({
                    where: { id: p.id },
                    select: { remaining: true },
                });
                const newRemaining = Math.max(0, Number(currentPartner?.remaining || 0) - Number(usedAmount));

                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: newRemaining,
                    },
                });

                await this.prisma.loan.update({
                    where: { id },
                    data: {
                        DEBT_ACKNOWLEDGMENT: null,
                        PROMISSORY_NOTE: null,
                    },
                });
            }
        }


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
            },
        });

        return { message: 'تم تعديل السلفة بنجاح', updated };
    }


    async deleteLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن حذفها');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        return await this.prisma.$transaction(async (tx) => {
            const repaymentIds = loan.repayments.map((r) => r.id);

            await tx.notification.deleteMany({
                where: {
                    OR: [
                        { loanId: id },
                        { repaymentId: { in: repaymentIds.length > 0 ? repaymentIds : undefined } },
                    ],
                },
            });

            const headersToDelete = await tx.journalHeader.findMany({
                where: {
                    OR: [
                        {
                            sourceType: JournalSourceType.LOAN,
                            sourceId: loan.id,
                        },
                        {
                            sourceType: JournalSourceType.REPAYMENT,
                            sourceId: repaymentIds.length > 0 ? { in: repaymentIds } : undefined,
                        },
                    ],
                },
                select: { id: true },
            });

            if (headersToDelete.length > 0) {
                const headerIds = headersToDelete.map(h => h.id);
                await tx.journalLine.deleteMany({ where: { journalId: { in: headerIds } } });
                await tx.journalHeader.deleteMany({ where: { id: { in: headerIds } } });
            }


            if (repaymentIds.length > 0) {
                await tx.repaymentCount.deleteMany({
                    where: { repaymentId: { in: repaymentIds } },
                });
            }

            const repaymentPayments = await tx.repaymentPayment.findMany({
                where: {
                    repaymentId: { in: repaymentIds },
                },
                select: {
                    proofUrl: true,
                },
            });

            for (const payment of repaymentPayments) {
                if (!payment.proofUrl) continue;

                try {
                    const urlPath = new URL(payment.proofUrl).pathname;
                    const localPath = path.join(
                        process.cwd(),
                        urlPath.replace(/^\//, '')
                    );

                    if (fs.existsSync(localPath)) {
                        fs.unlinkSync(localPath);
                    }
                } catch (e) {
                }
            }

            await tx.repaymentPayment.deleteMany({
                where: {
                    repaymentId: { in: repaymentIds },
                },
            });

            await tx.repayment.deleteMany({ where: { loanId: id } });

            await tx.loanPartnerShare.deleteMany({ where: { loanId: id } });

            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });

            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }

            await tx.loanNewCapitalShare.deleteMany({ where: { loanId: id } });


            const accrualsToDelete = await tx.partnerShareAccrual.findMany({
                where: { loanId: id },
            });

            for (const accrual of accrualsToDelete) {
                const partner = await tx.partner.findUnique({
                    where: { id: accrual.partnerId },
                    select: { upcomingProfit: true },
                });

                if (partner) {
                    const currentProfit = Number(partner.upcomingProfit || 0);
                    const decrementAmount = Number(accrual.partnerFinal || 0);
                    const newProfit = Math.max(0, currentProfit - decrementAmount);

                    await tx.partner.update({
                        where: { id: accrual.partnerId },
                        data: {
                            upcomingProfit: newProfit,
                        },
                    });
                }
            }

            await tx.partnerShareAccrual.deleteMany({ where: { loanId: id } });

            await tx.loanCount.deleteMany({ where: { loanId: id } });

            await tx.loan.delete({ where: { id } });


            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بحذف السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
                },
            });

            return { message: 'تم حذف السلفة بنجاح' };
        });
    }

    async uploadDebtAcknowledgmentFile(currentUser: number, loanId: number, file: Express.Multer.File, contractNumbers?: { debtAcknowledgmentNumber?: string }) {
        if (!file) throw new BadRequestException('No file uploaded');

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `إقرار الدين - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;


        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                DEBT_ACKNOWLEDGMENT: publicUrl,
                debtAcknowledgmentNumber: contractNumbers?.debtAcknowledgmentNumber
            },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل إقرار الدين للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });


        return { message: 'تم تحميل إقرار الدين بنجاح', path: publicUrl };
    }

    async uploadPromissoryNoteFile(currentUser: number, loanId: number, file: Express.Multer.File, contractNumbers?: { promissoryNoteNumber?: string }) {
        if (!file) throw new BadRequestException('No file uploaded');


        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


        const ext = path.extname(file.originalname);
        const fileName = `سند لأمر - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);


        fs.writeFileSync(filePath, file.buffer);


        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;


        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                PROMISSORY_NOTE: publicUrl,
                promissoryNoteNumber: contractNumbers?.promissoryNoteNumber
            },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل سند لأمر للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل سند لأمر بنجاح', path: publicUrl };
    }

    async uploadSettlementFile(currentUser: number, loanId: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');


        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status == LoanStatus.COMPLETED) {
            throw new BadRequestException('فقط السلف المكتملة يمكن تحميل ملف التسوية لها');
        }

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `تسوية - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        const totalPaidAmount = await this.prisma.repayment.aggregate({
            where: { loanId: loan.id },
            _sum: { paidAmount: true },
        }).then(res => res._sum.paidAmount || 0);

        await this.prisma.loan.update({
            where: { id: loan.id },
            data: {
                SETTLEMENT: publicUrl,
                status: 'COMPLETED',
                endDate: new Date(),
                newAmount: totalPaidAmount
            },
        });

        await this.updateClientStatus(loan.clientId);

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ملف التسوية للقرض رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل ملف التسوية بنجاح', path: publicUrl };
    }

    async saveContractNumbers(currentUser: number, loanId: number, contractNumbers: { debtAcknowledgmentNumber?: string; promissoryNoteNumber?: string }) {
        const updateData: any = {};

        if (contractNumbers.debtAcknowledgmentNumber) {
            updateData.debtAcknowledgmentNumber = contractNumbers.debtAcknowledgmentNumber;
        }

        if (contractNumbers.promissoryNoteNumber) {
            updateData.promissoryNoteNumber = contractNumbers.promissoryNoteNumber;
        }

        if (Object.keys(updateData).length === 0) {
            throw new BadRequestException('No contract numbers provided');
        }

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
        });

        if (!loan) throw new NotFoundException('Loan not found');

        const updatedLoan = await this.prisma.loan.update({
            where: { id: loanId },
            data: updateData,
        });


        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث أرقام العقود للسلفة رقم ${loan.code}`,
            },
        });

        return { message: 'تم حفظ أرقام العقود بنجاح', loan: updatedLoan };
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

        // Calculate how many months needed based on amountToTransfer / paymentAmount
        const principal = new Decimal(amountToTransfer);
        const paymentAmountDecimal = new Decimal(paymentAmount);
        const fullMonths = principal.div(paymentAmountDecimal).floor().toNumber();
        const lastPayment = principal.minus(paymentAmountDecimal.mul(fullMonths));
        const hasRemainder = lastPayment.gt(0);
        const months = hasRemainder ? fullMonths + 1 : fullMonths;

        // Calculate total interest based on original loan's interest rate
        const interestRate = new Decimal(loan.interestRate || 0).div(100);
        const totalInterest = principal.mul(interestRate);
        const totalAmount = principal.plus(totalInterest);

        if (paymentAmountDecimal.gt(totalAmount)) {
            throw new BadRequestException('مبلغ الدفعة لا يمكن أن يكون أكبر من إجمالي المبلغ');
        }

        // Distribute amountToTransfer across original repayments
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

            // Extract principal and interest from source repayments
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

                // Update original repayment
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

            // Create new loan with split repayments
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

            // Create repayments for new loan with proper distribution
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

            // Update original loan totals
            await tx.loan.update({
                where: { id: loanId },
                data: {
                    amount: { decrement: actualPrincipal },
                    interestAmount: { decrement: actualInterest },
                    totalAmount: { decrement: totalTransferred },
                },
            });

            // Create journal entry
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