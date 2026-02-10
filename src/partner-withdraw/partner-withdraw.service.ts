import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PartnerWithdrawService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    async previewPartnerDefaultShare(partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            select: {
                id: true,
                name: true,
                orgProfitPercent: true,
                PartnerWithdrawal: { select: { monthlyAmount: true } }
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');

        // Calculate defaults from general capital loans
        const partnerDefaultedGeneralLoans = await this.prisma.loanPartnerShare.findMany({
            where: {
                partnerId: partner.id,
                loan: {
                    status: 'ACTIVE',
                    source: { in: ['GENERAL', 'MIX'] },
                    client: {
                        status: 'متعثر',
                    },
                },
            },
            select: {
                sharePercent: true,
                loan: {
                    select: {
                        source: true,
                        generalAmount: true,
                        newCapitalAmount: true,
                        repayments: {
                            where: { remaining: { gt: 0 } },
                            select: { remaining: true },
                        },
                    },
                },
            },
        });

        // Calculate defaults from new capital loans
        const partnerDefaultedNewCapitalLoans = await this.prisma.loanNewCapitalShare.findMany({
            where: {
                partnerId: partner.id,
                loan: {
                    status: 'ACTIVE',
                    source: { in: ['NEW_CAPITAL', 'MIX'] },
                    client: {
                        status: 'متعثر',
                    },
                },
            },
            select: {
                percent: true,
                loan: {
                    select: {
                        generalAmount: true,
                        source: true,
                        newCapitalAmount: true,
                        repayments: {
                            where: { remaining: { gt: 0 } },
                            select: { remaining: true },
                        },
                    },
                },
            },
        });

        let partnerDefaultsBase = 0;

        // Process general capital defaults
        for (const lps of partnerDefaultedGeneralLoans) {
            const loanRemaining = lps.loan.repayments.reduce(
                (sum, r) => sum + (r.remaining || 0),
                0,
            );

            // For MIX loans, only count the general portion
            let applicableRemaining = loanRemaining;
            if (lps.loan.source === 'MIX' && lps.loan.generalAmount) {
                const generalRatio = lps.loan.generalAmount / (lps.loan.generalAmount + (lps.loan.newCapitalAmount || 0));
                applicableRemaining = loanRemaining * generalRatio;
            }

            partnerDefaultsBase += applicableRemaining * (lps.sharePercent / 100);
        }

        // Process new capital defaults
        for (const lncs of partnerDefaultedNewCapitalLoans) {
            const loanRemaining = lncs.loan?.repayments.reduce(
                (sum, r) => sum + (r.remaining || 0),
                0,
            );

            // For MIX loans, only count the new capital portion
            let applicableRemaining = loanRemaining || 0;
            if (lncs.loan?.source === 'MIX' && lncs.loan?.newCapitalAmount) {
                const newCapitalRatio = lncs.loan?.newCapitalAmount / ((lncs.loan?.generalAmount || 0) + lncs.loan?.newCapitalAmount);
                applicableRemaining = (loanRemaining || 0) * newCapitalRatio;
            }

            partnerDefaultsBase += applicableRemaining * (lncs.percent / 100);
        }

        const partnerOperationalRatio =
            (100 - partner.orgProfitPercent) / 100;

        const partnerDefaultShare = parseFloat(
            (partnerDefaultsBase * partnerOperationalRatio).toFixed(2)
        );

        return {
            partnerId: partner.id,
            partnerName: partner.name,
            monthlyAmount: partner.PartnerWithdrawal?.[0]?.monthlyAmount || 0,
            defaultsBase: parseFloat(partnerDefaultsBase.toFixed(2)),
            orgProfitPercent: partner.orgProfitPercent,
            operationalRatio: partnerOperationalRatio,
            partnerDefaultShare,
        };
    }

    async withdrawPartner(
        partnerId: number,
        monthlyAmount: number,
        userId: number,
        firstPaymentDate?: string
    ) {
        if (!monthlyAmount || monthlyAmount <= 0) {
            throw new BadRequestException("قيمة السداد الشهري غير صحيحة");
        }

        if (!firstPaymentDate) {
            throw new BadRequestException("تاريخ أول دفعة مطلوب");
        }

        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                LoanPartnerShare: true,
                LoanNewCapitalShare: true,
                AccountNewCapital: { select: { balance: true } },
                AccountEquity: { select: { balance: true } },
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');

        const loanSharesToBackup = await this.prisma.loanPartnerShare.findMany({
            where: {
                loan: {
                    status: 'ACTIVE',
                    LoanPartnerShare: {
                        some: { partnerId: partner.id }
                    }
                },
            },
            select: {
                id: true,
                partnerId: true,
                loanId: true,
                sharePercent: true,
                orgProfitPercent: true,
                isActive: true,
            },
        });

        const newCapitalSharesToBackup = await this.prisma.loanNewCapitalShare.findMany({
            where: {
                loan: {
                    status: 'ACTIVE',
                    LoanNewCapitalShare: {
                        some: { partnerId: partner.id }
                    }
                },
            },
            select: {
                id: true,
                partnerId: true,
                loanId: true,
                amountUsed: true,
                percent: true,
                orgProfitPercent: true,
            },
        });

        // Calculate defaults from GENERAL capital loans
        const partnerDefaultedGeneralLoans = await this.prisma.loanPartnerShare.findMany({
            where: {
                partnerId: partner.id,
                loan: {
                    status: 'ACTIVE',
                    source: { in: ['GENERAL', 'MIX'] },
                    client: {
                        status: 'متعثر',
                    },
                },
            },
            select: {
                sharePercent: true,
                loan: {
                    select: {
                        source: true,
                        generalAmount: true,
                        newCapitalAmount: true,
                        repayments: {
                            where: { remaining: { gt: 0 } },
                            select: { remaining: true },
                        },
                    },
                },
            },
        });

        // Calculate defaults from NEW_CAPITAL loans
        const partnerDefaultedNewCapitalLoans = await this.prisma.loanNewCapitalShare.findMany({
            where: {
                partnerId: partner.id,
                loan: {
                    status: 'ACTIVE',
                    source: { in: ['NEW_CAPITAL', 'MIX'] },
                    client: {
                        status: 'متعثر',
                    },
                },
            },
            select: {
                percent: true,
                loan: {
                    select: {
                        source: true,
                        generalAmount: true,
                        newCapitalAmount: true,
                        repayments: {
                            where: { remaining: { gt: 0 } },
                            select: { remaining: true },
                        },
                    },
                },
            },
        });

        let partnerDefaultsBase = 0;

        // Process general capital defaults
        for (const lps of partnerDefaultedGeneralLoans) {
            const loanRemaining = lps.loan.repayments.reduce(
                (sum, r) => sum + (r.remaining || 0),
                0,
            );

            // For MIX loans, only count the general portion
            let applicableRemaining = loanRemaining;
            if (lps.loan.source === 'MIX' && lps.loan.generalAmount && lps.loan.newCapitalAmount) {
                const totalLoanAmount = lps.loan.generalAmount + lps.loan.newCapitalAmount;
                const generalRatio = lps.loan.generalAmount / totalLoanAmount;
                applicableRemaining = loanRemaining * generalRatio;
            }

            partnerDefaultsBase += applicableRemaining * (lps.sharePercent / 100);
        }

        // Process new capital defaults
        for (const lncs of partnerDefaultedNewCapitalLoans) {
            const loanRemaining = lncs.loan?.repayments.reduce(
                (sum, r) => sum + (r.remaining || 0),
                0,
            );

            // For MIX loans, only count the new capital portion
            let applicableRemaining = loanRemaining || 0;
            if (lncs.loan?.source === 'MIX' && lncs.loan?.generalAmount && lncs.loan?.newCapitalAmount) {
                const totalLoanAmount = lncs.loan?.generalAmount + lncs.loan?.newCapitalAmount;
                const newCapitalRatio = lncs.loan?.newCapitalAmount / totalLoanAmount;
                applicableRemaining = (loanRemaining || 0) * newCapitalRatio;
            }

            partnerDefaultsBase += applicableRemaining * (lncs.percent / 100);
        }

        const partnerOperationalRatio =
            (100 - partner.orgProfitPercent) / 100;

        let partnerDefaultShare = parseFloat(
            (partnerDefaultsBase * partnerOperationalRatio).toFixed(2)
        );

        if (partnerDefaultShare < 0) partnerDefaultShare = 0;

        // Calculate total capital including new capital
        const newCapitalRemaining = partner.AccountNewCapital.balance || 0;
        const totalCapital = partner.totalAmount + newCapitalRemaining;
        const remainingCapital = totalCapital - partnerDefaultShare;

        await this.prisma.partner.update({
            where: { id: partnerId },
            data: {
                isActive: false,
                joinDistribute: false,
                WithdrawingStatus: 'WITHDRAWING',
                isFrozen: true,
                totalAmount: remainingCapital,
            },
        });

        await this.prisma.partnerNewCapital.updateMany({
            where: { partnerId: partnerId },
            data: {
                remaining: 0,
            },
        });

        await this.prisma.$transaction(async (tx) => {
            const zakatAccruals = await tx.zakatAccrual.findMany({
                where: { partnerId },
            });

            for (const accrual of zakatAccruals) {
                const isPaid = await tx.zakatPayment.findFirst({
                    where: {
                        partnerId,
                        year: accrual.year,
                        month: accrual.month,
                    },
                });

                if (!isPaid) {
                    await tx.zakatAccrual.delete({
                        where: { id: accrual.id },
                    });
                }
            }
        });

        if (partnerDefaultShare > 0) {
            const lossAccount = await this.prisma.account.findFirst({
                where: { accountBasicType: 'LOSSES' },
            });

            if (!lossAccount)
                throw new BadRequestException('حساب الخسائر غير موجود');

            const journal = await this.journalService.createJournal(
                {
                    reference: `DEFAULT-${partnerId}-${Date.now()}`,
                    description: `خصم نصيب المساهم (${partner.name}) من خسائر التعثر`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountEquityId,
                            debit: partnerDefaultShare,
                            credit: 0,
                            description: 'خصم من رأس مال المساهم',
                        },
                        {
                            accountId: lossAccount.id,
                            debit: 0,
                            credit: partnerDefaultShare,
                            description: 'إثبات خسائر التعثر',
                        },
                    ],
                },
                userId,
            );
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        let convertAmount = newCapitalRemaining;
        if (convertAmount > 0) {
            const journal = await this.journalService.createJournal(
                {
                    reference: `CONVERT-${partnerId}-${Date.now()}`,
                    description: `تحويل رأس مال المساهم (${partner.name}) من رأس المال الجديد إلى رأس المال العام بعد الانسحاب`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountNewCapitalId,
                            debit: convertAmount,
                            credit: 0,
                            description: 'خصم من رأس المال الجديد',
                        },
                        {
                            accountId: partner.accountEquityId,
                            debit: 0,
                            credit: convertAmount,
                            description: 'إضافة إلى رأس المال العام',
                        },
                    ],
                },
                userId,
            );
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        // Handle savings withdrawal
        const savingsAmount = partner.AccountSaving.balance;

        const savingAccount = await this.prisma.account.findUnique({
            where: { code: '20002' },
        });

        if (!savingAccount)
            throw new BadRequestException('حساب الادخار (20002) يجب ان يكون موجود');

        if (savingsAmount > 0) {
            const journal = await this.journalService.createJournal(
                {
                    reference: `SAVING-${partnerId}-${Date.now()}`,
                    description: `صرف مدخرات المساهم ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountSavingId,
                            debit: savingsAmount,
                            credit: 0,
                            description: 'خصم المدخرات',
                        },
                        {
                            accountId: savingAccount.id,
                            debit: 0,
                            credit: savingsAmount,
                            description: 'صرف المدخرات',
                        },
                    ],
                },
                userId,
            );
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        // Remove partner from general capital loans and redistribute shares
        const partnerGeneralLoans = await this.prisma.loanPartnerShare.findMany({
            where: {
                partnerId: partner.id,
                loan: { status: 'ACTIVE' },
            },
            include: {
                loan: {
                    include: {
                        LoanPartnerShare: true,
                    },
                },
            },
        });

        for (const pls of partnerGeneralLoans) {
            const loan = pls.loan;

            await this.prisma.loanPartnerShare.delete({
                where: { id: pls.id },
            });

            const remainingPartners = loan.LoanPartnerShare.filter(
                p => p.partnerId !== partner.id
            );

            if (remainingPartners.length === 0) continue;

            const totalRemainingPercent = remainingPartners.reduce(
                (sum, p) => sum + p.sharePercent,
                0,
            );

            for (const rp of remainingPartners) {
                const newPercent =
                    (rp.sharePercent / totalRemainingPercent) * 100;

                await this.prisma.loanPartnerShare.update({
                    where: { id: rp.id },
                    data: {
                        sharePercent: parseFloat(newPercent.toFixed(2)),
                    },
                });
            }
        }

        // Remove partner from new capital loans and redistribute shares
        const partnerNewCapitalLoans = await this.prisma.loanNewCapitalShare.findMany({
            where: {
                partnerId: partner.id,
                loan: { status: 'ACTIVE' },
            },
            include: {
                loan: {
                    include: {
                        LoanNewCapitalShare: true,
                    },
                },
            },
        });

        for (const lncs of partnerNewCapitalLoans) {
            const loan = lncs.loan;

            if (!loan) continue;

            await this.prisma.loanNewCapitalShare.delete({
                where: { id: lncs.id },
            });

            const remainingPartners = loan.LoanNewCapitalShare.filter(
                p => p.partnerId !== partner.id
            );

            if (remainingPartners.length === 0) continue;

            const totalRemainingPercent = remainingPartners.reduce(
                (sum, p) => sum + p.percent,
                0,
            );

            for (const rp of remainingPartners) {
                const newPercent =
                    (rp.percent / totalRemainingPercent) * 100;

                await this.prisma.loanNewCapitalShare.update({
                    where: { id: rp.id },
                    data: {
                        percent: parseFloat(newPercent.toFixed(2)),
                    },
                });
            }
        }

        // Create withdrawal schedule
        let remaining = remainingCapital;
        const schedule = [] as any;
        const startDate = firstPaymentDate ? new Date(firstPaymentDate) : new Date();
        let monthIndex = 0;

        while (remaining > 0) {
            const amount =
                remaining - monthlyAmount > 0 ? monthlyAmount : remaining;

            const payDate = new Date(startDate);
            payDate.setMonth(startDate.getMonth() + monthIndex);

            const s = await this.prisma.partnerWithdrawalSchedule.create({
                data: {
                    partnerId,
                    year: payDate.getFullYear(),
                    month: payDate.getMonth() + 1,
                    amount,
                    paidAmount: 0,
                    remaining: amount,
                    status: 'PENDING',
                    isPaid: false,
                },
            });

            schedule.push(s);
            remaining = parseFloat((remaining - amount).toFixed(2));
            monthIndex++;
        }

        const withdrawal = await this.prisma.partnerWithdrawal.create({
            data: {
                partnerId,
                monthlyAmount,
                totalCapital: totalCapital,
                defaultShare: partnerDefaultShare,
                remainingCapital,
                savingAmount: savingsAmount,
            },
        });

        await this.prisma.partnerWithdrawalBackup.create({
            data: {
                withdrawalId: withdrawal.id,
                partnerId: partnerId,
                loanShares: JSON.stringify(loanSharesToBackup),
                newCapitalShares: JSON.stringify(newCapitalSharesToBackup),
            },
        });

        return {
            message: 'تم طلب انسحاب المساهم بنجاح',
            withdrawal,
            schedule,
            savingsAmount,
            partnerDefaultShare,
            remainingCapital,
            totalCapital,
            newCapitalAmount: newCapitalRemaining,
        };
    }

    async getWithdrawalDetails(partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                PartnerWithdrawal: true,
            },
        });

        if (!partner) throw new NotFoundException("المستثمر غير موجود");

        if (!partner.PartnerWithdrawal)
            throw new NotFoundException("لا يوجد طلب انسحاب لهذا المساهم");

        const withdrawal = await this.prisma.partnerWithdrawal.findFirst({
            where: { partnerId },
        });

        if (!withdrawal)
            throw new NotFoundException("لا يوجد طلب انسحاب لهذا المساهم");

        const schedule = await this.prisma.partnerWithdrawalSchedule.findMany({
            where: { partnerId },
            orderBy: { id: "asc" },
        });

        const journals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: 'PARTNER_WITHDRAWING',
                OR: [
                    { sourceId: partner.id },
                    { sourceId: withdrawal.id },
                ],
            },
            include: {
                lines: true,
            },
            orderBy: { createdAt: 'asc' },
        });


        const savingsAmount = partner.AccountSaving?.balance ?? 0;

        return {
            partner: {
                id: partner.id,
                name: partner.name,
                nationalId: partner.nationalId,
                totalCapital: partner.totalAmount,
                totalProfit: partner.totalProfit,
                savings: savingsAmount,
                withdrawingStatus: partner.WithdrawingStatus,
                isFrozen: partner.isFrozen,
            },

            withdrawal,
            schedule,
            journals,
        };
    }

    async approveWithdrawalPayment(currentUser: number, scheduleId: number) {
        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: {
                partner: {
                    include: {
                        PartnerWithdrawal: {
                            select: { id: true },
                            take: 1,
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                },
            },
        });

        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');
        if (schedule.isPaid) throw new BadRequestException('الدفعة مدفوعة بالفعل');

        const partner = schedule.partner;
        if (!partner) throw new NotFoundException('المستثمر المرتبط غير موجود');

        const withdrawalId = schedule.partner.PartnerWithdrawal?.[0]?.id;

        if (!withdrawalId) {
            throw new NotFoundException('لا يوجد طلب انسحاب مرتبط بهذا المستثمر');
        }


        const carry = parseFloat((schedule.carryAmount || 0).toFixed(2));
        const ownRemaining = parseFloat((schedule.remaining ?? schedule.amount ?? 0).toFixed(2));
        const totalToPay = parseFloat((carry + ownRemaining).toFixed(2));
        if (totalToPay <= 0) throw new BadRequestException('لا يوجد مبلغ للدفع');

        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        if (!bankAccount) throw new BadRequestException('BANK account not found');

        if (!partner.accountEquityId) throw new BadRequestException('Partner equity account not configured');

        if (new Decimal(bankAccount.balance).lt(new Decimal(totalToPay))) throw new BadRequestException(`رصيد الصندوق غير كافي ,الرصيد المتاح هو ${bankAccount.balance}`);

        return await this.prisma.$transaction(async (tx) => {
            const createdJournalIds: number[] = [];

            if (carry > 0 && schedule.carryFromId) {
                const carryJournal = await this.journalService.createJournal(
                    {
                        reference: `PW-CARRY-${schedule.carryFromId}-TO-${schedule.id}-${Date.now()}`,
                        description: `صرف مبلغ محمول من جدول ${schedule.carryFromId} إلى جدول ${schedule.id} (جزء قديم)`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: withdrawalId,
                        lines: [
                            {
                                accountId: partner.accountEquityId,
                                debit: carry,
                                credit: 0,
                                description: `خصم من رأس المال (مبلغ محمول من ${schedule.carryFromId})`,
                            },
                            {
                                accountId: bankAccount.id,
                                debit: 0,
                                credit: carry,
                                description: `صرف مبلغ محمول من ${schedule.carryFromId} عبر جدول ${schedule.id}`,
                            },
                        ],
                    },
                    currentUser,
                );
                await this.journalService.postJournal(carryJournal.journal.id, currentUser);
                createdJournalIds.push(carryJournal.journal.id);
            }

            if (ownRemaining > 0) {
                const ownJournal = await this.journalService.createJournal(
                    {
                        reference: `PW-APPR-${schedule.id}-${Date.now()}`,
                        description: `صرف الدفعة لجدول انسحاب ${schedule.id} (مبلغ جديد)`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: withdrawalId,
                        lines: [
                            {
                                accountId: partner.accountEquityId,
                                debit: ownRemaining,
                                credit: 0,
                                description: 'خصم من رأس مال المساهم',
                            },
                            {
                                accountId: bankAccount.id,
                                debit: 0,
                                credit: ownRemaining,
                                description: 'صرف دفعة السحب',
                            },
                        ],
                    },
                    currentUser,
                );
                await this.journalService.postJournal(ownJournal.journal.id, currentUser);
                createdJournalIds.push(ownJournal.journal.id);
            }

            const updatedSchedule = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: parseFloat(((schedule.paidAmount || 0) + totalToPay).toFixed(2)),
                    remaining: 0,
                    status: 'PAID',
                    isPaid: true,
                    paidAt: new Date(),
                },
            });

            const unpaid = await tx.partnerWithdrawalSchedule.count({
                where: { partnerId: schedule.partnerId, isPaid: false },
            });
            if (unpaid === 0) {
                await tx.partner.update({
                    where: { id: partner.id },
                    data: {
                        WithdrawingStatus: 'WITHDRAWN'
                    }
                })
            }


            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'POST',
                    description: `قام المستخدم بالموافقة على صرف جدول انسحاب رقم ${scheduleId}`,
                },
            });

            return {
                message: 'تم صرف الدفعة بنجاح',
                schedule: updatedSchedule,
                journalIds: createdJournalIds,
            };
        });
    }

    async rejectWithdrawalPayment(currentUser: number, scheduleId: number) {
        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: {
                partner: {
                    include: {
                        PartnerWithdrawal: {
                            select: { id: true },
                            take: 1,
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                },
            },
        });

        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');

        const withdrawalId = schedule.partner.PartnerWithdrawal?.[0]?.id;

        if (!withdrawalId) {
            throw new NotFoundException('لا يوجد طلب انسحاب مرتبط بهذا المستثمر');
        }

        return await this.prisma.$transaction(async (tx) => {
            const ownJournals = await tx.journalHeader.findMany({
                where: {
                    sourceType: 'PARTNER_WITHDRAWING',
                    OR: [
                        { reference: { contains: `PW-APPR-${schedule.id}-` } },
                        { reference: { contains: `PW-PARTIAL-${schedule.id}-` } },
                    ],
                },
            });

            const carryJournals = await tx.journalHeader.findMany({
                where: {
                    sourceType: 'PARTNER_WITHDRAWING',
                    reference: { contains: `-TO-${schedule.id}-` },
                },
            });

            const journalsToUndo = [...ownJournals, ...carryJournals];

            let carryPaid = 0;
            let ownPaid = 0;

            for (const j of journalsToUndo) {
                const lines = await tx.journalLine.findMany({ where: { journalId: j.id } });
                const creditSum = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
                if ((j.reference || '').includes(`-TO-${schedule.id}-`)) {
                    carryPaid += creditSum;
                } else if (j.sourceId === schedule.id) {
                    ownPaid += creditSum;
                } else {
                    ownPaid += creditSum;
                }

                try {
                    await this.journalService.unpostJournal(currentUser, j.id);
                } catch (e) {
                }
                await tx.journalLine.deleteMany({ where: { journalId: j.id } });
                await tx.journalHeader.delete({ where: { id: j.id } });
            }

            const carryJournalRecord = carryJournals[0];
            let restoreCarryAmount = 0;
            if (carryJournalRecord) {
                restoreCarryAmount = carryPaid;
            }

            const restoredRemaining = parseFloat(((schedule.amount ?? 0)).toFixed(2));

            const updated = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: 0,
                    remaining: restoredRemaining,
                    status: 'PENDING',
                    isPaid: false,
                    paidAt: null,
                    carryAmount: restoreCarryAmount,
                },
            });

            const forwardedSchedules = await tx.partnerWithdrawalSchedule.findMany({
                where: { partnerId: schedule.partnerId, carryFromId: schedule.id },
                orderBy: [{ year: 'asc' }, { month: 'asc' }, { id: 'asc' }],
            });

            for (const fs of forwardedSchedules) {
                const forwardedAmt = fs.carryAmount || 0;
                if (fs.amount === 0) {
                    await tx.partnerWithdrawalSchedule.delete({
                        where: { id: fs.id },
                    });
                } else {
                    await tx.partnerWithdrawalSchedule.update({
                        where: { id: fs.id },
                        data: {
                            carryAmount: 0,
                            carryFromId: null,
                        },
                    });
                }
            }


            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'DELETE',
                    description: `قام المستخدم برفض/التراجع عن صرف جدول انسحاب رقم ${scheduleId}`,
                },
            });

            return { message: 'تم إلغاء الدفعة بنجاح', schedule: updated, undone: journalsToUndo.map(j => j.id) };
        });
    }

    private async findNextSchedulesForPartnerAfter(schedule) {
        return this.prisma.partnerWithdrawalSchedule.findMany({
            where: {
                partnerId: schedule.partnerId,
                isPaid: false,
                OR: [
                    { year: { gt: schedule.year } },
                    {
                        AND: [
                            { year: schedule.year },
                            { month: { gt: schedule.month } },
                        ],
                    },
                    {
                        AND: [
                            { year: schedule.year },
                            { month: schedule.month },
                            { id: { gt: schedule.id } },
                        ],
                    },
                ],
            },
            orderBy: [
                { year: 'asc' },
                { month: 'asc' },
                { id: 'asc' },
            ],
        });
    }

    async partialPayWithdrawal(currentUser: number, scheduleId: number, paidAmount: number) {
        if (!paidAmount || paidAmount <= 0) throw new BadRequestException('المبلغ المدفوع يجب أن يكون أكبر من صفر');

        const schedule = await this.prisma.partnerWithdrawalSchedule.findUnique({
            where: { id: scheduleId },
            include: {
                partner: {
                    include: {
                        PartnerWithdrawal: {
                            select: { id: true },
                            take: 1,
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                },
            },
        });
        if (!schedule) throw new NotFoundException('جدول السحب غير موجود');
        if (schedule.isPaid) throw new BadRequestException('الدفعة مدفوعة بالفعل');

        const bankAccount = await this.prisma.account.findFirst({ where: { accountBasicType: 'BANK' } });
        if (!bankAccount) throw new BadRequestException('BANK account not found');
        if (!schedule.partner?.accountEquityId) throw new BadRequestException('Partner equity account not configured');

        const withdrawalId = schedule.partner.PartnerWithdrawal?.[0]?.id;

        if (!withdrawalId) {
            throw new NotFoundException('لا يوجد طلب انسحاب مرتبط بهذا المستثمر');
        }

        let remainingToAllocate = parseFloat(paidAmount.toFixed(2));

        const originalCarry = parseFloat((schedule.carryAmount || 0).toFixed(2));
        const originalOwnRemaining = parseFloat(((schedule.remaining !== undefined && schedule.remaining !== null) ? schedule.remaining : schedule.amount).toFixed(2));

        const maxAllowed = parseFloat((originalCarry + originalOwnRemaining).toFixed(2));

        if (remainingToAllocate > maxAllowed) {
            throw new BadRequestException(
                `المبلغ المدفوع (${remainingToAllocate}) لا يمكن أن يكون أكبر من المستحق (${maxAllowed})`
            );
        }

        const createdJournalIds: number[] = [];

        return await this.prisma.$transaction(async (tx) => {
            let allocatedToCarry = 0;
            if (originalCarry > 0) {
                const take = Math.min(originalCarry, remainingToAllocate);
                allocatedToCarry = parseFloat(take.toFixed(2));
                remainingToAllocate = parseFloat((remainingToAllocate - allocatedToCarry).toFixed(2));

                if (allocatedToCarry > 0 && schedule.carryFromId) {
                    const carryJournal = await this.journalService.createJournal({
                        reference: `PW-PARTIAL-CARRY-${schedule.carryFromId}-TO-${schedule.id}-${Date.now()}`,
                        description: `سداد جزئي لمبلغ محمول من جدول ${schedule.carryFromId} إلى جدول ${schedule.id}`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: withdrawalId,
                        lines: [
                            { accountId: schedule.partner.accountEquityId, debit: allocatedToCarry, credit: 0, description: 'سداد جزء محمول' },
                            { accountId: bankAccount.id, debit: 0, credit: allocatedToCarry, description: 'صرف جزء محمول' },
                        ],
                    }, currentUser);
                    await this.journalService.postJournal(carryJournal.journal.id, currentUser);
                    createdJournalIds.push(carryJournal.journal.id);
                }
            }

            let allocatedToOwn = 0;
            if (remainingToAllocate > 0 && originalOwnRemaining > 0) {
                const take = Math.min(originalOwnRemaining, remainingToAllocate);
                allocatedToOwn = parseFloat(take.toFixed(2));
                remainingToAllocate = parseFloat((remainingToAllocate - allocatedToOwn).toFixed(2));

                if (allocatedToOwn > 0) {
                    const ownJournal = await this.journalService.createJournal({
                        reference: `PW-PARTIAL-${schedule.id}-${Date.now()}`,
                        description: `سداد جزئي لجدول انسحاب ${schedule.id}`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: withdrawalId,
                        lines: [
                            { accountId: schedule.partner.accountEquityId, debit: allocatedToOwn, credit: 0, description: 'سداد جزئي' },
                            { accountId: bankAccount.id, debit: 0, credit: allocatedToOwn, description: 'صرف جزئي' },
                        ],
                    }, currentUser);
                    await this.journalService.postJournal(ownJournal.journal.id, currentUser);
                    createdJournalIds.push(ownJournal.journal.id);
                }
            }

            const carryLeft = parseFloat((originalCarry - allocatedToCarry).toFixed(2));
            const ownLeft = parseFloat((originalOwnRemaining - allocatedToOwn).toFixed(2));
            const totalToForward = parseFloat((Math.max(0, carryLeft) + Math.max(0, ownLeft)).toFixed(2));

            const updatedSchedule = await tx.partnerWithdrawalSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: parseFloat(((schedule.paidAmount || 0) + allocatedToCarry + allocatedToOwn).toFixed(2)),
                    remaining: 0,
                    carryAmount: 0,
                    status: 'PAID',
                    isPaid: true,
                    paidAt: new Date(),
                },
            });

            if (totalToForward > 0) {
                let left = totalToForward;
                const nextSchedules = await this.findNextSchedulesForPartnerAfter(schedule);
                if (nextSchedules.length === 0) {
                    let nextMonth = schedule.month + 1;
                    let nextYear = schedule.year;

                    if (nextMonth > 12) {
                        nextMonth = 1;
                        nextYear += 1;
                    }

                    await tx.partnerWithdrawalSchedule.create({
                        data: {
                            partnerId: schedule.partnerId,
                            month: nextMonth,
                            year: nextYear,
                            amount: 0,
                            remaining: 0,
                            paidAmount: 0,
                            carryAmount: left,
                            carryFromId: schedule.id,
                            status: 'PENDING',
                            isPaid: false,
                        },
                    });

                    left = 0;
                } else {
                    for (const ns of nextSchedules) {
                        if (left <= 0) break;

                        const add = parseFloat(left.toFixed(2));

                        await tx.partnerWithdrawalSchedule.update({
                            where: { id: ns.id },
                            data: {
                                carryAmount: parseFloat(((ns.carryAmount || 0) + add).toFixed(2)),
                                carryFromId: schedule.id,
                            },
                        });

                        left = parseFloat((left - add).toFixed(2));
                    }
                }
            }

            const unpaid = await tx.partnerWithdrawalSchedule.count({
                where: { partnerId: schedule.partnerId, isPaid: false },
            });
            if (unpaid === 0) {
                await tx.partner.update({
                    where: { id: schedule.partnerId },
                    data: {
                        WithdrawingStatus: 'WITHDRAWN'
                    }
                })
            }

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'UPDATE',
                    description: `سداد جزئي لجدول انسحاب ${scheduleId} بمبلغ ${paidAmount} (allocatedToCarry=${allocatedToCarry}, allocatedToOwn=${allocatedToOwn}, forwarded=${totalToForward})`,
                },
            });

            return {
                message: 'تم تسجيل السداد الجزئي بنجاح',
                schedule: updatedSchedule,
                journalIds: createdJournalIds,
                allocatedToCarry,
                allocatedToOwn,
                forwarded: totalToForward,
            };
        });
    }

    async getAllWithdrawingPartners(page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const [partners, total] = await this.prisma.$transaction([
            this.prisma.partner.findMany({
                where: {
                    WithdrawingStatus: {
                        in: ['WITHDRAWING', 'WITHDRAWN'],
                    },
                },
                include: {
                    AccountSaving: true,
                    PartnerWithdrawal: true,
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.partner.count({
                where: {
                    WithdrawingStatus: {
                        in: ['WITHDRAWING', 'WITHDRAWN'],
                    },
                },
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            page,
            limit,
            total,
            totalPages,
            data: partners.map(partner => ({
                id: partner.id,
                name: partner.name,
                nationalId: partner.nationalId,
                totalAmount: partner.totalAmount,
                savings: partner.AccountSaving?.balance ?? 0,
                withdrawingStatus: partner.WithdrawingStatus,
                isFrozen: partner.isFrozen,
                withdrawalRequest: partner.PartnerWithdrawal?.[0] ?? null,
            })),
        };
    }

    async uploadWithdrawalReceipt(currentUser: number, partnerId: number, file: Express.Multer.File) {
        const withdrawal = await this.prisma.partnerWithdrawal.findFirst({
            where: { partnerId: partnerId },
            include: { partner: true },
        });

        if (!withdrawal) throw new NotFoundException('Withdrawal request not found');
        if (!file) throw new BadRequestException('No file uploaded');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const partner = withdrawal.partner;
        if (!partner) throw new NotFoundException('Associated partner not found');

        const uploadDir = path.join(process.cwd(), 'uploads', 'partners', partner.nationalId, 'withdrawals');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });


        if (withdrawal.WITHDRAWAL_RECEIPT) {
            try {
                let existingRelative = withdrawal.WITHDRAWAL_RECEIPT;
                if (existingRelative.startsWith('http')) {
                    existingRelative = decodeURI(existingRelative.replace(process.env.URL || '', ''));
                }
                const existingFull = path.join(process.cwd(), existingRelative);
                if (fs.existsSync(existingFull)) fs.unlinkSync(existingFull);
            } catch (err) {
                console.warn('Could not remove old withdrawal receipt file:', err.message);
            }
        }


        const fileExt = path.parse(file.originalname).ext || '.pdf';
        const fileName = `مخالصة مالية${fileExt}`;


        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);


        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;


        await this.prisma.partnerWithdrawal.update({
            where: { id: withdrawal.id },
            data: { WITHDRAWAL_RECEIPT: publicUrl },
        });

        const lastPartnerCount = await this.prisma.partnerCount.findFirst({
            orderBy: { count: 'desc' },
        });

        const newCount = lastPartnerCount ? lastPartnerCount.count + 1 : 1;

        await this.prisma.partnerCount.create({
            data: {
                partnerId: partner.id,
                count: newCount,
            },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'PartnerWithdrawals',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل مستند صرف المساهم: ${partner.name}`,
            },
        });

        return { message: 'تم رفع مستند السحب بنجاح', path: publicUrl };
    }

    async updateWithdrawalMonthlyAmount(
        currentUser: number,
        partnerId: number,
        newMonthlyAmount: number,
        firstPaymentDate?: string
    ) {
        if (!newMonthlyAmount || newMonthlyAmount <= 0) {
            throw new BadRequestException('قيمة الدفعة الجديدة غير صحيحة');
        }

        if (!firstPaymentDate) {
            throw new BadRequestException("تاريخ أول دفعة مطلوب");
        }

        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                PartnerWithdrawal: true,
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');

        if (partner.WithdrawingStatus !== 'WITHDRAWING') {
            throw new BadRequestException('لا يمكن تعديل السحب إلا أثناء حالة WITHDRAWING');
        }

        const withdrawal = await this.prisma.partnerWithdrawal.findFirst({
            where: { partnerId },
        });

        if (!withdrawal)
            throw new NotFoundException('لا يوجد طلب انسحاب لهذا المستثمر');

        const paidCount = await this.prisma.partnerWithdrawalSchedule.count({
            where: {
                partnerId,
                isPaid: true,
            },
        });

        if (paidCount > 0) {
            throw new BadRequestException(
                'لا يمكن تعديل مبلغ السحب بعد وجود دفعات مدفوعة'
            );
        }

        return await this.prisma.$transaction(async (tx) => {

            await tx.partnerWithdrawalSchedule.deleteMany({
                where: { partnerId },
            });

            let remaining = parseFloat(withdrawal.remainingCapital.toFixed(2));
            const startDate = firstPaymentDate ? new Date(firstPaymentDate) : new Date();
            let monthIndex = 0;
            const newSchedule = [] as any;

            while (remaining > 0) {
                const amount =
                    remaining - newMonthlyAmount > 0
                        ? newMonthlyAmount
                        : remaining;

                const payDate = new Date(startDate);
                payDate.setMonth(startDate.getMonth() + monthIndex);

                const s = await tx.partnerWithdrawalSchedule.create({
                    data: {
                        partnerId,
                        year: payDate.getFullYear(),
                        month: payDate.getMonth() + 1,
                        amount,
                        paidAmount: 0,
                        remaining: amount,
                        status: 'PENDING',
                        isPaid: false,
                    },
                });

                newSchedule.push(s);
                remaining = parseFloat((remaining - amount).toFixed(2));
                monthIndex++;
            }

            const UpdateWithdrawal = await this.prisma.partnerWithdrawal.update({
                where: { id: withdrawal.id },
                data: {
                    monthlyAmount: newMonthlyAmount,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'UPDATE',
                    description: `تعديل مبلغ السحب الشهري للمستثمر ${partner.name} إلى ${newMonthlyAmount}`,
                },
            });

            return {
                message: 'تم تعديل مبلغ السحب وإعادة إنشاء الجدول بنجاح',
                monthlyAmount: newMonthlyAmount,
                schedule: newSchedule,
            };
        });
    }

    async getNextPartnerCount(): Promise<number> {
        const lastPartnerCount = await this.prisma.partnerCount.findFirst({
            orderBy: { count: 'desc' },
        });

        return lastPartnerCount ? lastPartnerCount.count + 1 : 1;
    }

    async reverseWithdrawal(currentUser: number, partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                PartnerWithdrawal: true,
                AccountNewCapital: { select: { balance: true } },
                AccountEquity: { select: { balance: true } },
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');

        if (partner.WithdrawingStatus !== 'WITHDRAWING' && partner.WithdrawingStatus !== 'WITHDRAWN') {
            throw new BadRequestException('المستثمر ليس في حالة انسحاب');
        }

        if (!partner.PartnerWithdrawal || partner.PartnerWithdrawal.length === 0) {
            throw new BadRequestException('لا يوجد طلب انسحاب لهذا المستثمر');
        }

        const withdrawal = partner.PartnerWithdrawal[0];

        // Get backup data
        const backup = await this.prisma.partnerWithdrawalBackup.findFirst({
            where: { withdrawalId: withdrawal.id },
        });

        // Parse backup data with proper type handling
        let loanSharesBackup: any[] = [];
        let newCapitalSharesBackup: any[] = [];

        if (backup) {
            try {
                const parsedLoanShares = JSON.parse(backup.loanShares as string);
                const parsedNewCapitalShares = JSON.parse(backup.newCapitalShares as string);

                loanSharesBackup = Array.isArray(parsedLoanShares) ? parsedLoanShares : [];
                newCapitalSharesBackup = Array.isArray(parsedNewCapitalShares) ? parsedNewCapitalShares : [];
            } catch (error) {
                throw new BadRequestException('خطأ في قراءة بيانات النسخة الاحتياطية');
            }
        }

        // Check if any payments have been made
        const paidSchedules = await this.prisma.partnerWithdrawalSchedule.findMany({
            where: {
                partnerId,
                isPaid: true,
            },
        });

        if (paidSchedules.length > 0) {
            throw new BadRequestException(
                `لا يمكن التراجع عن الانسحاب لأن هناك ${paidSchedules.length} دفعة مدفوعة. يجب التراجع عن جميع الدفعات أولاً`
            );
        }

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        return await this.prisma.$transaction(async (tx) => {
            const withdrawalJournals = await tx.journalHeader.findMany({
                where: {
                    sourceType: 'PARTNER_WITHDRAWING',
                    OR: [
                        { sourceId: partner.id },
                        { sourceId: withdrawal.id },
                    ],
                },
                include: {
                    lines: true,
                },
                orderBy: { createdAt: 'desc' },
            });

            const journalSummary = {
                default: null as any,
                convert: null as any,
                saving: null as any,
                posted: [] as number[],
                draft: [] as number[],
            };

            for (const journal of withdrawalJournals) {
                const ref = journal.reference || '';

                // Categorize journals
                if (ref.includes('DEFAULT-')) {
                    journalSummary.default = journal;
                } else if (ref.includes('CONVERT-')) {
                    journalSummary.convert = journal;
                } else if (ref.includes('SAVING-')) {
                    journalSummary.saving = journal;
                }

                // Track posted vs draft
                if (journal.status === 'POSTED') {
                    journalSummary.posted.push(journal.id);
                } else {
                    journalSummary.draft.push(journal.id);
                }

                // Unpost if posted
                if (journal.status === 'POSTED') {
                    try {
                        await this.journalService.unpostJournal(currentUser, journal.id);
                    } catch (e) {
                        console.warn(`Failed to unpost journal ${journal.id}:`, e);
                    }
                }

                // Delete journal lines
                await tx.journalLine.deleteMany({
                    where: { journalId: journal.id },
                });

                // Delete journal header
                await tx.journalHeader.delete({
                    where: { id: journal.id },
                });
            }

            const deletedSchedules = await tx.partnerWithdrawalSchedule.deleteMany({
                where: { partnerId },
            });

            const originalTotalCapital = withdrawal.totalCapital;
            const defaultShare = withdrawal.defaultShare || 0;
            const savingAmount = withdrawal.savingAmount || 0;

            let convertedAmount = 0;
            if (journalSummary.convert) {
                const convertLine = journalSummary.convert.lines.find(
                    (l: any) => l.accountId === partner.accountNewCapitalId && l.debit > 0
                );
                if (convertLine) {
                    convertedAmount = convertLine.debit;
                }
            }

            const originalNewCapital = convertedAmount;
            const originalGeneralCapital = originalTotalCapital - originalNewCapital;

            await tx.partner.update({
                where: { id: partnerId },
                data: {
                    isActive: true,
                    joinDistribute: true,
                    WithdrawingStatus: 'ACTIVE',
                    isFrozen: false,
                    capitalAmount: originalGeneralCapital,
                    totalAmount: originalGeneralCapital,
                },
            });

            await tx.partnerNewCapital.updateMany({
                where: { partnerId: partnerId },
                data: {
                    remaining: originalNewCapital,
                },
            });

            let restoredLoanSharesCount = 0;
            let restoredNewCapitalSharesCount = 0;

            const loanSharesByLoanId = new Map<number, any[]>();
            for (const share of loanSharesBackup) {
                const loanId = share.loanId;
                if (!loanId) continue;

                if (!loanSharesByLoanId.has(loanId)) {
                    loanSharesByLoanId.set(loanId, []);
                }
                loanSharesByLoanId.get(loanId)!.push(share);
            }

            // Restore loan shares loan by loan
            for (const [loanId, backupShares] of loanSharesByLoanId) {
                // Delete ALL current shares for this loan
                await tx.loanPartnerShare.deleteMany({
                    where: { loanId },
                });

                // Recreate ALL shares from backup (including the withdrawing partner)
                for (const backupShare of backupShares) {
                    await tx.loanPartnerShare.create({
                        data: {
                            loanId: loanId,
                            partnerId: backupShare.partnerId,
                            sharePercent: backupShare.sharePercent,
                            orgProfitPercent: backupShare.orgProfitPercent,
                            isActive: backupShare.isActive ?? true,
                        },
                    });
                    restoredLoanSharesCount++;
                }
            }

            const newCapitalSharesByLoanId = new Map<number, any[]>();
            for (const share of newCapitalSharesBackup) {
                const loanId = share.loanId;
                if (!loanId) continue;

                if (!newCapitalSharesByLoanId.has(loanId)) {
                    newCapitalSharesByLoanId.set(loanId, []);
                }
                newCapitalSharesByLoanId.get(loanId)!.push(share);
            }

            for (const [loanId, backupShares] of newCapitalSharesByLoanId) {
                await tx.loanNewCapitalShare.deleteMany({
                    where: { loanId },
                });

                for (const backupShare of backupShares) {
                    await tx.loanNewCapitalShare.create({
                        data: {
                            loanId: loanId,
                            partnerId: backupShare.partnerId,
                            amountUsed: backupShare.amountUsed,
                            percent: backupShare.percent,
                            orgProfitPercent: backupShare.orgProfitPercent,
                        },
                    });
                    restoredNewCapitalSharesCount++;
                }
            }

            // Delete the backup after successful restoration
            await tx.partnerWithdrawalBackup.delete({
                where: { withdrawalId: withdrawal.id },
            });

            await tx.partnerWithdrawal.delete({
                where: { id: withdrawal.id },
            });

            await tx.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'PartnerWithdrawals',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بالتراجع الكامل عن انسحاب المستثمر ${partner.name}. ` +
                        `تم حذف ${withdrawalJournals.length} قيد محاسبي و ${deletedSchedules.count} جدول دفعات. ` +
                        `استعادة ${restoredLoanSharesCount} حصة قروض عامة و ${restoredNewCapitalSharesCount} حصة رأس مال جديد. ` +
                        `رأس المال العام ${originalGeneralCapital}, رأس المال الجديد ${originalNewCapital}`,
                },
            });

            return {
                message: 'تم التراجع الكامل عن الانسحاب بنجاح',
                summary: {
                    deletedJournals: {
                        total: withdrawalJournals.length,
                        posted: journalSummary.posted.length,
                        draft: journalSummary.draft.length,
                        defaultJournal: journalSummary.default ? 'تم حذفه' : 'غير موجود',
                        convertJournal: journalSummary.convert ? 'تم حذفه' : 'غير موجود',
                        savingJournal: journalSummary.saving ? 'تم حذفه' : 'غير موجود',
                    },
                    deletedSchedules: deletedSchedules.count,
                    restoredShares: {
                        loanShares: restoredLoanSharesCount,
                        newCapitalShares: restoredNewCapitalSharesCount,
                    },
                    restoredCapital: {
                        generalCapital: originalGeneralCapital,
                        newCapital: originalNewCapital,
                        totalCapital: originalTotalCapital,
                        defaultShare: defaultShare,
                        savingAmount: savingAmount,
                    },
                    partnerStatus: {
                        isActive: true,
                        joinDistribute: true,
                        withdrawingStatus: 'ACTIVE',
                        isFrozen: false,
                    },
                },
            };
        });
    }
}