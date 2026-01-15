import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

type LoanRevenueEntry = {
    loanId: number;
    rawShare: number;
    companyCut: number;
    partnerShare: number;
    cents: number;
    description: string;
};


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
                isActive: true,
                joinDistribute: true,

                OR: [
                    {
                        createdAt: {
                            gte: from,
                            lte: to,
                        },
                    },
                    {
                        transactions: {
                            some: {
                                date: {
                                    gte: from,
                                    lte: to,
                                },
                                type: { in: ['DEPOSIT'] },
                            },
                        },
                    },
                ],
            },
            select: {
                id: true,
                name: true,
                capitalAmount: true,
                totalProfit: true,
                orgProfitPercent: true,
                transactions: { select: { type: true, date: true, amount: true } },
                PartnerNewCapital: { select: { amount: true, remaining: true } },
                LoanNewCapitalShare: { select: { loan: { select: { status: true } }, amountUsed: true } },
            },
        });

        const partnerProfitInPeriod = await this.prisma.partnerShareAccrual.groupBy({
            by: ['partnerId'],
            where: {
                createdAt: {
                    gte: from,
                    lte: to,
                },
            },
            _sum: {
                partnerFinal: true,
            },
        });

        const partnerProfitMap = new Map<number, number>();

        for (const p of partnerProfitInPeriod) {
            partnerProfitMap.set(
                p.partnerId,
                Number(p._sum.partnerFinal || 0)
            );
        }

        const capitalByPartner = partners.map(partner => {
            const totalNewCapital = partner.PartnerNewCapital?.reduce(
                (s, nc) => s + Number(nc.amount || 0),
                0
            ) || 0;

            const remainingNewCapital = partner.PartnerNewCapital?.reduce(
                (s, nc) => s + Number(nc.remaining || 0),
                0
            ) || 0;

            const periodProfit = partnerProfitMap.get(partner.id) || 0;

            const isDepositOnly = partner.transactions?.some(t => t.type === 'DEPOSIT');
            const amount = partner.transactions?.reduce((s, t) => {
                if (t.date < from) return s;
                return s + Number(t.amount || 0);
            }, 0);

            return {
                partnerName: partner.name,
                capitalAmount: isDepositOnly ? amount :
                    Number(partner.capitalAmount || 0),
                totalProfit: Number(periodProfit),
                newCapitalAmount: remainingNewCapital,
                totalAmount: isDepositOnly ? amount :
                    Number(partner.capitalAmount || 0)
                    + Number(partner.totalProfit || 0)
                    + remainingNewCapital
            };
        });

        const totalCapital = capitalByPartner.reduce(
            (sum, p) => sum + p.totalAmount,
            0
        );

        const accruals = await this.prisma.partnerShareAccrual.findMany({
            where: {
                ...(periodId ? { periodId } : {}),
                createdAt: {
                    gte: from,
                    lte: to,
                },
            },
            include: {
                loan: {
                    select: {
                        id: true,
                        source: true,
                        client: { select: { id: true, name: true } },
                    },
                },
            },
        });

        const DATE_FORMAT = 'yyyy-MM-dd';

        let totalRevenue = 0;
        let totalCompanyRevenue = 0;
        let totalPartnersRevenue = 0;
        let totalRevenueGeneral = 0;
        let totalRevenueNewCapital = 0;

        const revenueByClientMap = new Map<number, any>();

        for (const acc of accruals) {
            const raw = Number(acc.rawShare || 0);
            const company = Number(acc.companyCut + acc.cents || 0);
            const partner = Number(acc.partnerFinal || 0);

            if (raw <= 0) continue;

            totalRevenue += raw;
            totalCompanyRevenue += company;
            totalPartnersRevenue += partner;

            if (acc.loan?.source === 'GENERAL') {
                totalRevenueGeneral += raw;
            } else if (acc.loan?.source === 'NEW_CAPITAL') {
                totalRevenueNewCapital += raw;
            }

            const client = acc.loan?.client;
            if (!client) continue;

            if (!revenueByClientMap.has(client.id)) {
                revenueByClientMap.set(client.id, {
                    clientId: client.id,
                    clientName: client.name,

                    grossRevenue: 0,
                    companyRevenue: 0,
                    partnersRevenue: 0,

                    entries: new Map<number, LoanRevenueEntry>(),
                });
            }

            const clientGroup = revenueByClientMap.get(client.id);

            clientGroup.grossRevenue += raw;
            clientGroup.companyRevenue += company;
            clientGroup.partnersRevenue += partner;

            const loanId = acc.loan?.id;
            if (!loanId) continue;

            if (!clientGroup.entries.has(loanId)) {
                clientGroup.entries.set(loanId, {
                    loanId,
                    rawShare: 0,
                    companyCut: 0,
                    partnerShare: 0,
                    description: 'توزيع فائدة السلفة',
                });
            }

            const loanEntry = clientGroup.entries.get(loanId)!;

            loanEntry.rawShare += raw;
            loanEntry.companyCut += company;
            loanEntry.partnerShare += partner;
        }

        const revenueByClient = Array.from(revenueByClientMap.values()).map(c => ({
            clientId: c.clientId,
            clientName: c.clientName,

            totalRevenue: Number(c.grossRevenue.toFixed(2)),
            companyRevenue: Number(c.companyRevenue.toFixed(2)),
            partnersRevenue: Number(c.partnersRevenue.toFixed(2)),

            entries: Array.from(c.entries.values()).map((e: LoanRevenueEntry) => ({
                loanId: e.loanId,
                rawShare: Number(e.rawShare.toFixed(2)),
                companyCut: Number((e.companyCut + e.cents).toFixed(2)),
                partnerShare: Number(e.partnerShare.toFixed(2)),
                description: e.description,
            })),
        }));

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

        const netProfit = totalRevenue - totalExpenses;

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