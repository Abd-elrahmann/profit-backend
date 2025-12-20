import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class IncomeStatementService {
    constructor(private prisma: PrismaService) { }

    async getIncomeStatement(fromDate?: string, toDate?: string) {
        if (!fromDate || !toDate) {
            throw new BadRequestException('يجب تحديد fromDate و toDate للفترة');
        }

        const from = DateTime.fromISO(fromDate, { zone: 'Asia/Riyadh' }).startOf('day').toUTC().toJSDate();
        const to = DateTime.fromISO(toDate, { zone: 'Asia/Riyadh' }).endOf('day').toUTC().toJSDate();

        const capitalResult = await this.prisma.partner.aggregate({
            _sum: { capitalAmount: true },
            where: { isActive: true },
        });
        const totalCapital = capitalResult._sum.capitalAmount || 0;

        const revenueJournals = await this.prisma.journalHeader.findMany({
            where: { date: { gte: from, lte: to }, status: 'POSTED' },
            include: {
                lines: {
                    where: { account: { type: 'REVENUE' } },
                    include: { account: true }
                }
            }
        });

        let totalRevenue = 0;
        const revenueDetails: any[] = [];
        for (const j of revenueJournals) {
            const journalTotal = j.lines.reduce((sum, l) => sum + (l.credit - l.debit), 0);
            totalRevenue += journalTotal;
            revenueDetails.push({
                journalId: j.id,
                reference: j.reference,
                description: j.description,
                date: j.date,
                total: journalTotal,
                lines: j.lines.map(l => ({
                    accountName: l.account.name,
                    debit: l.debit,
                    credit: l.credit,
                    amount: l.credit - l.debit,
                    description: l.description,
                }))
            });
        }

        // --- المصروفات باستخدام ExpenseRecord ---
        const expenseRecords = await this.prisma.expenseRecord.findMany({
            where: { createdAt: { gte: from, lte: to } },
            include: {
                user: { select: { id: true, name: true } },
                employee: { select: { id: true, name: true } },
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
                createdAt: e.createdAt,
            };
        });

        const netProfit = totalRevenue - totalExpenses;

        return {
            totalCapital,
            totalRevenue,
            totalExpenses,
            detailedExpenses,
            netProfit,
        };
    }
}