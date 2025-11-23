import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class SavingService {
    constructor(private readonly prisma: PrismaService) { }

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
                date: a.createdAt
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
}