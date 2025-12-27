import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class IncomeStatementService {
    constructor(private prisma: PrismaService) { }

    async getIncomeStatement(params: {
        fromDate?: string;
        toDate?: string;
        month?: number;
        year?: number;
        periodId?: number;
    }) {
        const { fromDate, toDate, month, year, periodId } = params;

        let from: Date;
        let to: Date;

        const now = DateTime.now().setZone('Asia/Riyadh');

        if (periodId) {
            const period = await this.prisma.periodHeader.findUnique({
                where: { id: periodId },
            });

            if (!period) {
                throw new BadRequestException('الفترة المحاسبية غير موجودة');
            }

            from = DateTime
                .fromJSDate(period.startDate)
                .setZone('Asia/Riyadh')
                .startOf('day')
                .toUTC()
                .toJSDate();

            to = period.endDate
                ? DateTime.fromJSDate(period.endDate)
                    .setZone('Asia/Riyadh')
                    .endOf('day')
                    .toUTC()
                    .toJSDate()
                : now.endOf('day').toUTC().toJSDate();

        } else if (month && year) {
            from = DateTime
                .fromObject({ year, month, day: 1 }, { zone: 'Asia/Riyadh' })
                .startOf('month')
                .toUTC()
                .toJSDate();

            to = DateTime
                .fromObject({ year, month, day: 1 }, { zone: 'Asia/Riyadh' })
                .endOf('month')
                .toUTC()
                .toJSDate();

        } else if (fromDate && toDate) {
            from = DateTime
                .fromISO(fromDate, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toUTC()
                .toJSDate();

            to = DateTime
                .fromISO(toDate, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toUTC()
                .toJSDate();

        } else {
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { isClosed: false },
                orderBy: { startDate: 'desc' },
            });

            if (!currentPeriod) {
                throw new BadRequestException('لا توجد فترة محاسبية مفتوحة');
            }

            from = DateTime
                .fromJSDate(currentPeriod.startDate)
                .setZone('Asia/Riyadh')
                .startOf('day')
                .toUTC()
                .toJSDate();

            to = now.endOf('day').toUTC().toJSDate();
        }

        const partners = await this.prisma.partner.findMany({
            where: {
                createdAt: { gte: from, lte: to },
                isActive: true
            },
            select: {
                id: true,
                name: true,
                capitalAmount: true,
                orgProfitPercent: true,
                PartnerNewCapital: { select: { amount: true, remaining: true } },
            },
        });

        const capitalByPartner = partners.map(partner => {
            const totalNewCapital = partner.PartnerNewCapital?.reduce(
                (s, nc) => s + Number(nc.amount || 0),
                0
            ) || 0;

            const remainingNewCapital = partner.PartnerNewCapital?.reduce(
                (s, nc) => s + Number(nc.remaining || 0),
                0
            ) || 0;

            return {
                partnerId: partner.id,
                partnerName: partner.name,
                capitalAmount: Number(partner.capitalAmount || 0),
                newCapitalTotal: totalNewCapital,
                newCapitalRemaining: remainingNewCapital,
                profitPercentage: partner.orgProfitPercent,
            };
        });

        const totalCapital = capitalByPartner.reduce(
            (sum, p) => sum + p.capitalAmount + p.newCapitalTotal,
            0
        );

        const revenueJournals = await this.prisma.journalHeader.findMany({
            where: {
                date: { gte: from, lte: to },
                status: 'POSTED',
            },
            include: {
                lines: {
                    include: {
                        account: true,
                        client: true,
                    },
                },
            },
        });

        const DATE_FORMAT = 'yyyy-MM-dd';

        let totalRevenue = 0;
        let totalRevenueGeneral = 0;
        let totalRevenueNewCapital = 0;

        const revenueByClientMap = new Map<number, any>();

        for (const journal of revenueJournals) {

            if (journal.sourceType !== 'REPAYMENT' || !journal.sourceId) continue;

            const repayment = await this.prisma.repayment.findUnique({
                where: { id: journal.sourceId },
                include: { loan: true },
            });

            if (!repayment || !repayment.loan) continue;

            const revenueLine = journal.lines.find(
                l => l.account.type === 'REVENUE' && l.credit > 0
            );
            if (!revenueLine) continue;

            const amount = revenueLine.credit - revenueLine.debit;
            if (amount <= 0) continue;

            totalRevenue += amount;

            if (repayment.loan.source === 'GENERAL') {
                totalRevenueGeneral += amount;
            } else if (repayment.loan.source === 'NEW_CAPITAL') {
                totalRevenueNewCapital += amount;
            }

            const clientLine = journal.lines.find(
                l => l.clientId !== null
            );
            if (!clientLine || !clientLine.client) continue;

            const clientId = clientLine.client.id;

            if (!revenueByClientMap.has(clientId)) {
                revenueByClientMap.set(clientId, {
                    clientId,
                    clientName: clientLine.client.name,
                    totalAmount: 0,
                    entries: [],
                });
            }

            const clientGroup = revenueByClientMap.get(clientId);

            clientGroup.totalAmount += amount;
            clientGroup.entries.push({
                journalId: journal.id,
                date: DateTime
                    .fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat(DATE_FORMAT),
                amount,
                description:
                    revenueLine.description ||
                    journal.description ||
                    'إيراد',
            });
        }
        const revenueByClient = Array.from(revenueByClientMap.values());

        const expenseRecords = await this.prisma.expenseRecord.findMany({
            where: { createdAt: { gte: from, lte: to } },
            include: {
                user: { select: { id: true, name: true } },
                employee: { select: { id: true, name: true } },
                journal: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        let totalExpenses = 0;
        const detailedExpenses = expenseRecords.map((e) => {
            totalExpenses += e.amount;
            return {
                type: e.type,
                amount: e.amount,
                description: e.description,
                employee: e.employee?.name || null,
                createdAt: DateTime
                    .fromJSDate(e.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat(DATE_FORMAT),

            };
        });

        const netProfit = totalRevenueGeneral - totalExpenses;

        return {
            period: {
                from: DateTime.fromJSDate(from).setZone('Asia/Riyadh').toFormat('yyyy-MM-dd'),
                to: DateTime.fromJSDate(to).setZone('Asia/Riyadh').toFormat('yyyy-MM-dd'),
                source: periodId
                    ? 'PERIOD'
                    : month && year
                        ? 'MONTH'
                        : fromDate && toDate
                            ? 'CUSTOM'
                            : 'CURRENT_PERIOD',
                periodId: periodId ?? null,
            },
            totalCapital,
            capitalByPartner,
            totalRevenue,
            revenues: {
                total: totalRevenue,
                generalLoans: totalRevenueGeneral,
                newCapitalLoans: totalRevenueNewCapital,
            },
            revenueByClient,
            totalExpenses,
            detailedExpenses,
            netProfit,
        };
    }
}