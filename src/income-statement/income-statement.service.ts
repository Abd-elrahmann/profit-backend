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
    }) {
        const { fromDate, toDate, month, year } = params;

        let from: Date;
        let to: Date;

        if (month && year) {
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
            throw new BadRequestException(
                'يجب إرسال (fromDate و toDate) أو (month و year)'
            );
        }
        const capitalResult = await this.prisma.partner.aggregate({
            _sum: { capitalAmount: true },
            where: { isActive: true },
        });
        const totalCapital = capitalResult._sum.capitalAmount || 0;

        const revenueJournals = await this.prisma.journalHeader.findMany({
            where: {
                date: { gte: from, lte: to },
                status: 'POSTED',
            },
            include: {
                lines: {
                    where: {
                        account: { type: 'REVENUE' },
                    },
                    include: {
                        account: true,
                        client: true,
                    },
                },
                ExpenseRecord: false,
            },
        });

        let totalRevenue = 0;
        const revenueDetails = [] as any;

        for (const journal of revenueJournals) {
            for (const line of journal.lines) {
                const amount = line.credit - line.debit;
                if (amount <= 0) continue;

                totalRevenue += amount;

                revenueDetails.push({
                    journalId: journal.id,
                    journalDate: journal.date,
                    account: {
                        id: line.account.id,
                        name: line.account.name,
                        code: line.account.code,
                    },
                    amount,
                    client: line.client
                        ? {
                            id: line.client.id,
                            name: line.client.name,
                        }
                        : null,
                    description: line.description || journal.description,
                });
            }
        }

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
                id: e.id,
                type: e.type,
                amount: e.amount,
                description: e.description,
                addedBy: e.user?.name || null,
                employee: e.employee?.name || null,
                journalId: e.journalId,
                createdAt: DateTime.fromJSDate(e.createdAt)
                    .setZone('Asia/Riyadh')
                    .toISO(),
            };
        });

        const netProfit = totalRevenue - totalExpenses;

        return {
            period: {
                from,
                to,
                timezone: 'Asia/Riyadh',
            },
            totalCapital,
            totalRevenue,
            totalExpenses,
            detailedExpenses,
            netProfit,
            revenueDetails,
        };
    }
}