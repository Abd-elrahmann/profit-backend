import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { AccountBasicType, JournalSourceType, LoanFundSource, LoanStatus, LoanType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalService } from '../journal/journal.service';
import { ClientStatusService } from '../client/client-status.service';
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
        private readonly clientStatusService: ClientStatusService,
    ) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    async getUnpostedJournalsForLoans() {
        const loanSourceTypes = [
            JournalSourceType.LOAN,
            JournalSourceType.REPAYMENT,
            JournalSourceType.LOAN_INTEREST,
            JournalSourceType.LOAN_CONVERSION,
        ];

        const unpostedJournals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: { in: loanSourceTypes },
                status: { not: 'POSTED' },
            },
            orderBy: { id: 'asc' },
        });

        const loanIds = new Set<number>();
        const repaymentIds = new Set<number>();
        for (const j of unpostedJournals) {
            if (!j.sourceId) continue;
            if (j.sourceType === 'LOAN' || j.sourceType === 'LOAN_INTEREST' || j.sourceType === 'LOAN_CONVERSION') {
                loanIds.add(j.sourceId);
            } else if (j.sourceType === 'REPAYMENT') {
                repaymentIds.add(j.sourceId);
            }
        }

        const [loans, repayments] = await Promise.all([
            loanIds.size > 0
                ? this.prisma.loan.findMany({
                    where: { id: { in: [...loanIds] } },
                    select: { id: true, code: true, client: { select: { name: true } } },
                })
                : [],
            repaymentIds.size > 0
                ? this.prisma.repayment.findMany({
                    where: { id: { in: [...repaymentIds] } },
                    select: { id: true, loan: { select: { code: true, client: { select: { name: true } } } } },
                })
                : [],
        ]);

        type LoanInfo = { code?: string; clientName?: string };
        const loanMap = new Map<number, LoanInfo>();
        for (const l of loans) {
            loanMap.set(l.id, { code: l.code, clientName: l.client?.name });
        }
        const repaymentMap = new Map<number, LoanInfo>();
        for (const r of repayments) {
            repaymentMap.set(r.id, { code: r.loan?.code, clientName: r.loan?.client?.name });
        }

        const items = unpostedJournals.map((j) => {
            let loanCode: string | undefined;
            let clientName: string | undefined;
            if (j.sourceId) {
                if (j.sourceType === 'LOAN' || j.sourceType === 'LOAN_INTEREST' || j.sourceType === 'LOAN_CONVERSION') {
                    const info = loanMap.get(j.sourceId);
                    loanCode = info?.code;
                    clientName = info?.clientName;
                } else if (j.sourceType === 'REPAYMENT') {
                    const info = repaymentMap.get(j.sourceId);
                    loanCode = info?.code;
                    clientName = info?.clientName;
                }
            }
            return {
                id: j.id,
                reference: j.reference,
                sourceType: j.sourceType ?? '',
                loanCode,
                clientName,
            };
        });

        return {
            count: items.length,
            items,
        };
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

        if (
            loan.source !== LoanFundSource.NEW_CAPITAL &&
            loan.source !== LoanFundSource.MIX
        ) {
            return;
        }

        const shares = await tx.loanNewCapitalShare.findMany({
            where: { loanId: loan.id },
        });

        const sharePartnerIds = shares
            .filter((s) => Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2)) > 0)
            .map((s) => s.partnerId);
        const partnersMap =
            sharePartnerIds.length > 0
                ? new Map(
                    (await tx.partner.findMany({
                        where: { id: { in: sharePartnerIds } },
                        select: { id: true, accountNewCapitalId: true, accountEquityId: true },
                    })).map((p) => [p.id, p]),
                )
                : new Map();

        const lines: JournalLineDto[] = [];

        for (const s of shares) {
            const used = Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2));
            if (used <= 0) continue;

            const partner = partnersMap.get(s.partnerId);
            if (!partner) continue;

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
                    accountId: partner.accountNewCapitalId!,
                    debit: used,
                    credit: 0,
                    description: `تحويل رأس مال شريك إلى العام (قرض ${loan.id})`,
                },
                {
                    accountId: partner.accountEquityId!,
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

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, currentUser);
        }
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

        const accrualPartnerIds = accruals.map((a) => a.partnerId);
        const accrualPartnersMap =
            accrualPartnerIds.length > 0
                ? new Map(
                    (await tx.partner.findMany({
                        where: { id: { in: accrualPartnerIds } },
                        select: { id: true, upcomingProfit: true },
                    })).map((p) => [p.id, p]),
                )
                : new Map();

        for (const acc of accruals) {
            const partner = accrualPartnersMap.get(acc.partnerId);
            const current = new Decimal(partner?.upcomingProfit || 0);
            const decrement = new Decimal(acc.partnerFinal || 0);
            const updated = Decimal.max(new Decimal(0), current.minus(decrement)).toDecimalPlaces(2);
            await tx.partner.update({
                where: { id: acc.partnerId },
                data: { upcomingProfit: Number(updated) },
            });
        }

        if (
            loan.source !== LoanFundSource.NEW_CAPITAL &&
            loan.source !== LoanFundSource.MIX
        ) {
            return;
        }

        const sharePartnerIds = loan.LoanNewCapitalShare
            .filter((s) => Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2)) > 0)
            .map((s) => s.partnerId);
        const partnersMap =
            sharePartnerIds.length > 0
                ? new Map(
                    (await tx.partner.findMany({
                        where: { id: { in: sharePartnerIds } },
                        select: { id: true, capitalAmount: true },
                    })).map((p) => [p.id, p]),
                )
                : new Map();

        for (const s of loan.LoanNewCapitalShare) {
            const used = Number(new Decimal(s.amountUsed || 0).toDecimalPlaces(2));
            if (used <= 0) continue;

            const partner = partnersMap.get(s.partnerId);
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

    async createLoan(currentUser, dto: CreateLoanDto, tx?: Prisma.TransactionClient) {
        const prisma = tx ?? this.prisma;

        const client = await prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await prisma.user.findUnique({ where: { id: currentUser } });

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
            const bankAccount = await prisma.account.findFirst({
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
            const generalPartners = await prisma.partner.findMany({
                where: {
                    isActive: true,
                    joinDistribute: true,
                    isNewPartner: false
                },
            });

            const bank = await prisma.account.findFirst({
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

            const newCapitalBank = await prisma.account.findUnique({
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
            const bank = await prisma.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });
            if (!bank) throw new NotFoundException('Bank account not found');
            if (principal.gt(new Decimal(bank.balance))) {
                throw new BadRequestException('السلفة أكبر من رصيد البنك المتاح');
            }
        }

        if (dto.partnerId) {
            const partnerCheck = await prisma.partner.findUnique({
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

        const bankAccount = await prisma.bANK_accounts.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount) throw new NotFoundException('Bank account not found');
        if (bankAccount.limit <= 0) throw new BadRequestException('انتهى الحد المسموح للحساب البنكي');


        const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths;
        const hasRemainder = lastPayment.gt(0);


        if (dto.kafeelId) {
            const kafeel = await prisma.kafeel.findUnique({
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


        const loan = await prisma.loan.create({
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
                isOpening: dto.isOpening ?? false,
                isOpeningJournalId: dto.isOpeningJournalId ?? null
            },
        });

        const lastLoanCount = await prisma.loanCount.findFirst({
            orderBy: { count: 'desc' },
        });

        const newCount = lastLoanCount ? lastLoanCount.count + 1 : 1;

        await prisma.loanCount.create({
            data: {
                loanId: loan.id,
                count: newCount,
            },
        });

        if (
            (fundSource === LoanFundSource.GENERAL || fundSource === LoanFundSource.MIX) &&
            generalAmount.gt(0)
        ) {
            const partners = await prisma.partner.findMany({
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

                await prisma.loanPartnerShare.create({
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
            const partners = await prisma.partnerNewCapital.findMany({
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

                await prisma.loanNewCapitalShare.create({
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

                const currentPartner = await prisma.partnerNewCapital.findUnique({
                    where: { id: p.id },
                    select: { remaining: true },
                });

                const currentRemaining = new Decimal(currentPartner?.remaining || 0);
                const usedDecimal = new Decimal(usedAmount);
                const newRemaining = Decimal.max(0, currentRemaining.minus(usedDecimal))
                    .toDecimalPlaces(2);

                await prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: Number(newRemaining),
                    },
                });
            }
        }

        const account = await prisma.bANK_accounts.update({
            where: { id: dto.bankAccountId },
            data: { limit: { decrement: 1 } },
            select: { limit: true },
        });
        if (account.limit <= 0) {
            await prisma.bANK_accounts.update({
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

        await prisma.repayment.createMany({ data: repayments });


        await prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء سلفة جديدة للعميل ${client.name} بمبلغ ${dto.amount}`,
            },
        });


        const loanWithIncludes = await prisma.loan.findUnique({
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
                client: { select: { id: true, name: true, accountId: true, interestAccountId: true } },
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

        let clientAccountId = loan.client.accountId;
        let clientInterestAccountId = loan.client.interestAccountId;

        if (!clientAccountId || !clientInterestAccountId) {
            throw new BadRequestException('حساب العميل غير موجود');
        }

        let creditAccount;
        let journalLines: any[] = [];

        if (loan.source === LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
            journalLines = [
                { accountId: clientAccountId, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
                { accountId: creditAccount.id, debit: 0, credit: loan.amount, description: 'سلفة عميل' },
            ];
        } else if (loan.source === LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
            journalLines = [
                { accountId: clientAccountId, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
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
                { accountId: clientAccountId, debit: loan.amount, credit: 0, description: 'سلفة عميل', clientId: loan.clientId },
                { accountId: generalBank.id, debit: 0, credit: loan.amount, description: 'سلفة عميل' },
            );

            creditAccount = generalBank;
        }

        const clientName = loan.client?.name ?? `العميل ${loan.clientId}`;

        const autoPostSetting = await this.prisma.settings.findFirst();

        if (!loan.isOpening) {
            const { journal } = await this.journalService.createJournal(
                {
                    reference: `LN - ${loan.id}`,
                    description: `صرف سلفة للعميل ${clientName}`,
                    type: 'GENERAL',
                    sourceType: JournalSourceType.LOAN,
                    sourceId: loan.id,
                    lines: journalLines,
                },
                userId,
            );

            const clientjournal = await this.journalService.createJournal({
                reference: `int - ${loan.id}`,
                description: `تحويل فوائد سلفة للعميل ${clientName} إلى حسابه`,
                type: 'GENERAL',
                sourceType: 'LOAN_INTEREST',
                sourceId: loan.id,
                lines: [
                    { accountId: clientAccountId, debit: loan.interestAmount, credit: 0, clientId: loan.clientId },
                    { accountId: clientInterestAccountId, debit: 0, credit: loan.interestAmount },
                ],
            }, userId);

            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(journal.id, userId);
                await this.journalService.postJournal(clientjournal.journal.id, userId);
            }

            await this.prisma.loan.update({
                where: { id },
                data: {
                    status: LoanStatus.ACTIVE,
                    disbursementJournalId: journal.id,
                },
            });
        } else if (loan.isOpening && loan.interestAmount > 0) {
            const clientjournal = await this.journalService.createJournal({
                reference: `int - ${loan.id}`,
                description: `تحويل فوائد سلفة للعميل ${clientName} إلى حسابه`,
                type: 'GENERAL',
                sourceType: 'LOAN_INTEREST',
                sourceId: loan.id,
                lines: [
                    { accountId: clientAccountId, debit: loan.interestAmount, credit: 0, clientId: loan.clientId },
                    { accountId: clientInterestAccountId, debit: 0, credit: loan.interestAmount },
                ],
            }, userId);

            if (autoPostSetting?.autoPost) {
                await this.journalService.postJournal(clientjournal.journal.id, userId);
            }

            await this.prisma.loan.update({
                where: { id },
                data: {
                    status: LoanStatus.ACTIVE,
                },
            });
        } else {
            await this.prisma.loan.update({
                where: { id },
                data: {
                    status: LoanStatus.ACTIVE,
                },
            });
        }

        await this.prisma.$transaction(async (tx) => {
            await this.handleNewCapitalOnActivation(
                tx,
                loan,
                userId,
            );
        });

        await this.clientStatusService.updateClientStatus(loan.clientId);

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'Loans',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتفعيل السلفة رقم ${loan.code} للعميل ${clientName}`,
            },
        });

        return {
            message: 'تم تفعيل السلفة بنجاح',
            loanId: id,
        };
    }

    async deactivateLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
                client: { select: { name: true } },
            },
        });

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.ACTIVE)
            throw new BadRequestException('فقط السلف النشطة يمكن إلغاء تفعيلها');

        const clientName = loan.client?.name ?? `العميل ${loan.clientId}`;

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
                        console.warn(`⚠️ Skipped unposting journal ${journalId}: `, (e as Error).message);
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

            await this.clientStatusService.updateClientStatus(loan.clientId);

            await this.handleNewCapitalOnDeactivation(tx, id);

            await tx.partnerShareAccrual.deleteMany({ where: { loanId: id } });


            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بإلغاء تفعيل السلفة رقم ${loan.code} للعميل ${clientName}`,
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
            include: {
                LoanPartnerShare: true,
                LoanNewCapitalShare: true,
                client: { select: { name: true } },
            },
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

        if (loan.isOpeningJournalId && dto.amount !== undefined) {
            const newAmount = new Decimal(dto.amount);
            const oldAmount = new Decimal(loan.amount);

            const diff = oldAmount.minus(newAmount);

            if (!diff.isZero()) {
                const openingJournal = await this.prisma.journalHeader.findUnique({
                    where: { id: loan.isOpeningJournalId },
                    include: {
                        lines: {
                            include: {
                                account: true,
                            },
                        },
                    },
                });

                if (!openingJournal) {
                    throw new BadRequestException('Opening journal not found');
                }

                const clientLine = openingJournal.lines.find(
                    (l) => l.account.accountBasicType === AccountBasicType.CLIENT,
                );

                const bankLine = openingJournal.lines.find(
                    (l) =>
                        l.account.accountBasicType === AccountBasicType.BANK ||
                        l.account.id === loan.bankAccountId,
                );

                if (!clientLine || !bankLine) {
                    throw new BadRequestException('Invalid opening journal structure');
                }

                const adjustmentLines = [] as any;

                if (diff.gt(0)) {
                    adjustmentLines.push({
                        accountId: clientLine.accountId,
                        debit: 0,
                        credit: Number(diff.toFixed(2)),
                        description: 'تعديل سلفة عميل',
                        clientId: loan.clientId,
                    });

                    adjustmentLines.push({
                        accountId: bankLine.accountId,
                        debit: Number(diff.toFixed(2)),
                        credit: 0,
                        description: 'تعديل سلفة بنك',
                    });
                } else {
                    const absDiff = diff.abs();

                    adjustmentLines.push({
                        accountId: clientLine.accountId,
                        debit: Number(absDiff.toFixed(2)),
                        credit: 0,
                        description: 'تعديل سلفة عميل',
                        clientId: loan.clientId,
                    });

                    adjustmentLines.push({
                        accountId: bankLine.accountId,
                        debit: 0,
                        credit: Number(absDiff.toFixed(2)),
                        description: 'تعديل سلفة بنك',
                    });
                }

                const adjustmentJournal = await this.journalService.createJournal(
                    {
                        reference: `LN-ADJ-${loan.id}`,
                        description: `تعديل سلفة رقم ${loan.code}`,
                        type: 'ADJUSTMENT',
                        sourceType: JournalSourceType.LOAN,
                        sourceId: loan.id,
                        lines: adjustmentLines,
                    },
                    currentUser,
                );

                const settings = await this.prisma.settings.findFirst();
                if (settings?.autoPost) {
                    await this.journalService.postJournal(adjustmentJournal.journal.id, currentUser);
                }
            }
        }

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


        const clientName = loan.client?.name ?? `العميل ${loan.clientId}`;
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث السلفة رقم ${loan.code} للعميل ${clientName}`,
            },
        });

        return { message: 'تم تعديل السلفة بنجاح', updated };
    }

    async deleteLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
                client: { select: { name: true } },
            },
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

            const clientName = loan.client?.name ?? `العميل ${loan.clientId}`;
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بحذف السلفة رقم ${loan.code} للعميل ${clientName}`,
                },
            });

            return { message: 'تم حذف السلفة بنجاح' };
        });
    }
}