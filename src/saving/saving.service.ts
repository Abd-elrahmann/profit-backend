import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';
import moment from "moment-hijri";
import { JournalService } from '../journal/journal.service';
import { JournalSourceType, JournalType, TransactionType } from '@prisma/client';

@Injectable()
export class SavingService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    // Partner saving summary (per period)
    async getPartnerSavingSummary(partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                PartnerSavingAccrual: {
                    include: {
                        accrual: {
                            include: {
                                period: true
                            }
                        }
                    }
                }
            }
        });

        if (!partner) throw new NotFoundException('Partner not found');

        const summaryByPeriod = partner.PartnerSavingAccrual.reduce((acc, a) => {
            const period = a.accrual?.period;
            const periodId = period?.id;
            const periodName = period?.name || 'Unknown';

            if (!acc[periodId]) {
                acc[periodId] = {
                    periodId,
                    periodName,
                    totalSaving: 0,
                    accruals: []
                };
            }

            acc[periodId].totalSaving += Number(a.savingAmount);

            acc[periodId].accruals.push({
                savingId: a.id,
                savingAmount: Number(a.savingAmount),
                date: a.createdAt,
                dateHijri: this.toHijri(a.createdAt)
            });

            return acc;
        }, {} as Record<number, any>);

        return Object.values(summaryByPeriod);
    }

    // Get all partners savings summaries (paginated) per period with filters
    async getAllPartnerSavings(
        page: number = 1,
        filters?: { limit?: number; name?: string; nationalId?: string; phone?: string }
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        // Build filter object
        const where: any = {};
        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.nationalId) where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.phone) where.phone = { contains: filters.phone, mode: 'insensitive' };
        where.PartnerSavingAccrual = { some: {} };

        // Count total partners
        const totalPartners = await this.prisma.partner.count({ where });
        const totalPages = Math.ceil(totalPartners / limit);
        if (page > totalPages && totalPartners > 0) throw new NotFoundException('Page not found');


        // Fetch partners with saving accruals only (NO PARTNER DATA INCLUDES)
        const partners = await this.prisma.partner.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                PartnerSavingAccrual: {
                    include: {
                        accrual: {
                            include: {
                                period: true,
                            },
                        },
                    },
                },
            },
        });

        // Format periods and group savings WITHOUT duplicated nested structures
        const data = partners.map((p) => {
            const periodMap = new Map<string, any>();

            p.PartnerSavingAccrual.forEach((s) => {
                const period = s.accrual?.period;
                const periodName = period?.name || 'Unknown';

                if (!periodMap.has(periodName)) {
                    periodMap.set(periodName, {
                        period: {
                            id: period?.id,
                            name: period?.name,
                            startDate: period?.startDate,
                            endDate: period?.endDate,
                            startdateHijri: period?.startDate ? this.toHijri(period.startDate) : null,
                            enddateHijri: period?.endDate ? this.toHijri(period.endDate) : null,
                        },
                        total: 0,
                        accrualCount: 0, // to avoid returning full accrual objects
                    });
                }

                const record = periodMap.get(periodName);
                record.total += Number(s.savingAmount);
                record.accrualCount += 1; // count only, not full object
            });

            return {
                partnerId: p.id,
                partnerName: p.name,
                periods: Array.from(periodMap.values()),
            };
        });

        return {
            data,
            pagination: { totalPartners, totalPages, currentPage: page, limit },
        };
    }

    // Saving account report by month
    async getSavingAccountReport(month?: string) {
        let monthStart: Date | undefined;
        let monthEnd: Date | undefined;

        if (month) {
            const [year, monthNum] = month.split('-').map(Number);
            monthStart = DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toUTC()
                .toJSDate();
            monthEnd = DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: 'Asia/Riyadh' })
                .endOf('month')
                .endOf('day')
                .toUTC()
                .toJSDate();
        }

        const savingAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'SAVINGS' },
            include: {
                entries: {
                    where: { journal: { status: 'POSTED', ...(monthStart && monthEnd ? { date: { gte: monthStart, lte: monthEnd } } : {}) } },
                    include: { journal: { include: { postedBy: { select: { id: true, name: true } } } }, client: { select: { id: true, name: true } } },
                    orderBy: { id: 'desc' },
                },
            },
        });

        if (!savingAccount) throw new NotFoundException('Saving account not found');

        const groupedByMonth = savingAccount.entries.reduce((acc, entry) => {
            const date = DateTime.fromJSDate(entry.journal.date).setZone('Asia/Riyadh');
            const monthKey = date.toFormat('yyyy-LL');

            if (!acc[monthKey]) acc[monthKey] = { entries: [], totalDebit: 0, totalCredit: 0, totalBalance: 0 };

            acc[monthKey].entries.push({
                id: entry.journal.id,
                date: date.toISO(),
                dateHijri: this.toHijri(entry.journal.date),
                reference: entry.journal.reference,
                description: entry.description ?? entry.journal.description,
                debit: entry.debit,
                credit: entry.credit,
                balance: entry.balance,
                client: entry.client?.name ?? null,
                postedBy: entry.journal.postedBy?.name ?? null,
                status: entry.journal.status,
                type: entry.journal.type,
            });

            acc[monthKey].totalDebit += entry.debit ?? 0;
            acc[monthKey].totalCredit += entry.credit ?? 0;
            acc[monthKey].totalBalance += entry.balance ?? 0;

            return acc;
        }, {} as Record<string, { entries: any[]; totalDebit: number; totalCredit: number; totalBalance: number }>);

        return {
            account: { id: savingAccount.id, name: savingAccount.name, code: savingAccount.code, debit: savingAccount.debit, credit: savingAccount.credit, balance: savingAccount.balance },
            totalJournalEntries: savingAccount.entries.length,
            journalsByMonth: groupedByMonth,
        };
    }

    private calculateEqualWithdrawWithAbsorption(
        partners: { id: number; saving: number }[],
        totalWithdraw: number
    ) {
        const result = partners.map(p => ({
            partnerId: p.id,
            savingBefore: p.saving,
            savingAfter: p.saving,
            withdraw: 0,
        }));

        let remainingAmount = totalWithdraw;
        let remainingPartners = [...result];

        while (remainingAmount > 0 && remainingPartners.length > 0) {
            const share = remainingAmount / remainingPartners.length;

            const stillEligible: typeof remainingPartners = [];

            for (const p of remainingPartners) {
                const canPay = Math.min(p.savingAfter, share);

                p.withdraw += canPay;
                p.savingAfter -= canPay;
                remainingAmount -= canPay;

                if (p.savingAfter > 0) {
                    stillEligible.push(p);
                }
            }

            remainingPartners = stillEligible;
        }

        // rounding بدون فرق فلس
        let distributed = 0;
        for (const p of result) {
            p.withdraw = Math.floor(p.withdraw * 100) / 100;
            distributed += p.withdraw;
            p.savingAfter = Number((p.savingBefore - p.withdraw).toFixed(2));
        }

        const remainder = Number((totalWithdraw - distributed).toFixed(2));
        if (remainder !== 0) {
            const largest = result.reduce((a, b) =>
                a.withdraw > b.withdraw ? a : b
            );
            largest.withdraw += remainder;
            largest.savingAfter = Number(
                (largest.savingBefore - largest.withdraw).toFixed(2)
            );
        }

        return result;
    }

    async previewGlobalSavingWithdrawal(amount: number) {
        if (amount <= 0)
            throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');

        const partners = await this.prisma.partner.findMany({
            where: {
                AccountSaving: { balance: { gt: 0 } },
            },
            include: { AccountSaving: true },
        });

        if (!partners.length)
            throw new BadRequestException('لا يوجد شركاء لديهم رصيد توفير');

        const totalSaving = partners.reduce(
            (s, p) => s + Number(p.AccountSaving.balance),
            0
        );

        if (amount > totalSaving)
            throw new BadRequestException('المبلغ أكبر من إجمالي التوفير');

        const distribution = this.calculateEqualWithdrawWithAbsorption(
            partners.map(p => ({
                id: p.id,
                saving: Number(p.AccountSaving.balance),
            })),
            amount
        );

        return {
            amount,
            totalSaving,
            partnersCount: partners.length,
            distribution,
        };
    }

    async withdrawFromAllPartnersSavings(
        currentUser: number,
        amount: number,
        description?: string
    ) {
        const preview = await this.previewGlobalSavingWithdrawal(amount);

        const bank = await this.prisma.account.findUnique({
            where: { code: '11000' },
        });
        if (!bank) throw new NotFoundException('Bank not found');

        const savingAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'SAVINGS' },
        });
        if (!savingAccount)
            throw new NotFoundException('Saving account not found');

        const reference = `SW-${Date.now()}`;

        return this.prisma.$transaction(async (tx) => {

            const partnerSavingLines = [] as any;

            for (const item of preview.distribution) {
                if (item.withdraw <= 0) continue;

                const partner = await this.prisma.partner.findUnique({
                    where: { id: item.partnerId },
                    select: {
                        accountSavingId: true,
                        name: true,
                    },
                });

                partnerSavingLines.push({
                    accountId: partner!.accountSavingId,
                    debit: item.withdraw,
                    credit: 0,
                    description: `سحب من توفير الشريك ${partner!.name}`,
                });
            }

            const savingAccountLine = {
                accountId: savingAccount.id,
                debit: 0,
                credit: amount,
                description: 'سحب من صندوق الادخار',
            };

            const journal = await this.journalService.createJournal(
                {
                    reference,
                    description:
                        description ??
                        `سحب جماعي من حسابات التوفير بقيمة ${amount}`,
                    type: JournalType.GENERAL,
                    sourceType: JournalSourceType.PARTNER_SAVING_WITHDRAWAL,
                    lines: [
                        ...partnerSavingLines,
                        savingAccountLine,
                    ],
                },
                currentUser,
            );

            await this.journalService.postJournal(journal.journal.id, currentUser);

            for (const item of preview.distribution) {
                if (item.withdraw <= 0) continue;

                await tx.partnerTransaction.create({
                    data: {
                        partnerId: item.partnerId,
                        type: TransactionType.SAVING_WITHDRAWAL,
                        amount: item.withdraw,
                        reference: `${reference} - P${item.partnerId}`,
                        description:
                            description ??
                            `سحب جماعي من التوفير`,
                        journalId: journal.journal.id,
                    },
                });
            }

            return {
                message: 'تم السحب الجماعي من حساب التوفير بنجاح',
                journalId: journal.journal.id,
                distribution: preview.distribution,
            };
        });
    }
}