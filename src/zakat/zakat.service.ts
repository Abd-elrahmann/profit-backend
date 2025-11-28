import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DateTime } from 'luxon';
import { use } from 'passport';

type ZakatYearSummary = {
    partnerId: number;
    partnerName: string;
    capitalAmount: number;
    year: number;
    annualZakat: number;
    monthlyZakat: number;
    totalPaid: number;
    remaining: number;
    monthlyBreakdown: any[];
    payments?: any[];
};

@Injectable()
export class ZakatService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // Get yearly zakat summary for a partner
    async getPartnerZakatSummary(partnerId: number, year?: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
        });

        if (!partner) throw new NotFoundException('Partner not found');

        // Helper: build summary for a specific year
        const buildYearSummary = async (yr: number): Promise<ZakatYearSummary> => {

            // Determine start month for this year
            const partnerStartYear = partner.createdAt ? new Date(partner.createdAt).getFullYear() : yr;
            const startMonth = yr === partnerStartYear
                ? new Date(partner.createdAt).getMonth() + 1
                : 1;

            const remainingMonths = 12 - startMonth + 1;
            const annualZakat = partner.totalAmount * 0.025;
            const monthlyZakat = annualZakat / remainingMonths;

            // Get accruals (one entry per month)
            const accruals = await this.prisma.zakatAccrual.findMany({
                where: { partnerId, year: yr },
                orderBy: { month: 'asc' },
            });

            // Get all payments in that year
            const payments = await this.prisma.zakatPayment.findMany({
                where: { partnerId, year: yr },
            });

            // Add status to each month based on payments
            const monthlyWithStatus = await Promise.all(
                accruals.map(async (acc) => {
                    // Find payment for this month (may not exist)
                    const payment = payments.find((p) => p.month === acc.month);

                    let status = 'NOT_PAID';

                    if (payment) {
                        const journal = await this.prisma.journalHeader.findFirst({
                            where: {
                                sourceType: 'ZAKAT',
                                sourceId: payment.id,
                                status: 'POSTED',
                            },
                        });

                        if (journal) status = 'PAID';
                    }

                    return {
                        ...acc,
                        status,
                        paymentVoucher: payment?.PAYMENT_VOUCHER
                    };
                })
            );

            // Calculate total paid (posted only)
            const postedPayments = await Promise.all(
                payments.map(async (p) => {
                    const journal = await this.prisma.journalHeader.findFirst({
                        where: {
                            sourceType: 'ZAKAT',
                            sourceId: p.id,
                            status: 'POSTED',
                        },
                    });
                    return journal ? p.amount : 0;
                })
            );

            const totalPaid = postedPayments.reduce((a, b) => a + b, 0);

            const remaining = annualZakat - totalPaid;

            return {
                partnerId,
                partnerName: partner.name,
                capitalAmount: partner.totalAmount,
                year: yr,
                annualZakat,
                monthlyZakat,
                totalPaid,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: monthlyWithStatus, // updated
            };
        };

        // If year is provided → return that specific year
        if (year) {
            return await buildYearSummary(year);
        }

        // No year → return all years
        const allAccruals = await this.prisma.zakatAccrual.findMany({
            where: { partnerId },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        const distinctYears = [...new Set(allAccruals.map((a) => a.year))];

        const results: ZakatYearSummary[] = [];

        for (const yr of distinctYears) {
            results.push(await buildYearSummary(yr));
        }

        return results;
    }

    async getYearlyAllPartners(year: number, page: number = 1, limit?: number) {
        const pageLimit = limit && limit > 0 ? limit : 10;
        const skip = (page - 1) * pageLimit;

        const totalPartners = await this.prisma.partner.count({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
        });

        const totalPages = Math.ceil(totalPartners / pageLimit);

        if (page > totalPages && totalPartners > 0) {
            throw new NotFoundException('Page not found');
        }

        // If no partners have data for this year, return empty result
        if (totalPartners === 0) {
            return {
                data: [],
                pagination: {
                    totalPartners: 0,
                    totalPages: 0,
                    currentPage: page,
                    limit: pageLimit,
                    hasNextPage: false,
                    hasPreviousPage: false,
                },
            };
        }

        // Get partners with pagination (only those with zakah data for the year)
        const partners = await this.prisma.partner.findMany({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
            skip,
            take: pageLimit,
            orderBy: { id: 'asc' },
            include: {
                ZakatAccrual: {
                    where: { year }, // Filter accruals by the specified year
                    orderBy: { month: 'asc' },
                },
            },
        });

        const results: ZakatYearSummary[] = [];

        for (const p of partners) {
            const partnerStartYear = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
            const startMonth = year === partnerStartYear
                ? new Date(p.createdAt).getMonth() + 1
                : 1;

            const remainingMonths = 12 - startMonth + 1;

            const annualZakat = p.totalAmount * 0.025;
            const zakattofixed = Number(annualZakat.toFixed(2));
            const monthlyZakat = zakattofixed / remainingMonths;

            // Sum zakat payments for this partner/year (filtered by year)
            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year }, // Filter payments by the specified year
                _sum: { amount: true },
            });

            const paidAmount = payments._sum.amount || 0;
            const remaining = annualZakat - paidAmount;

            results.push({
                partnerId: p.id,
                partnerName: p.name,
                capitalAmount: p.totalAmount,
                year,
                annualZakat,
                monthlyZakat,
                totalPaid: paidAmount,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: p.ZakatAccrual,
            });
        }

        return {
            data: results,
            pagination: {
                totalPartners,
                totalPages,
                currentPage: page,
                limit: pageLimit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    async withdrawZakat(
        amount: number,
        userId: number,
    ) {
        if (amount <= 0) {
            throw new BadRequestException("المبلغ يجب أن يكون أكبر من صفر");
        }

        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount) throw new BadRequestException('zakat account (20001) must exist');


        if (zakatAccount.balance < amount) {
            throw new BadRequestException("الرصيد في حساب الزكاة غير كافٍ للسحب");
        }

        const bankAccount = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bankAccount) throw new NotFoundException("Bank account not found");

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const reference = `ZAKAT-WITHDRAW-${zakatAccount.id}-${year}-${month}`;

        const journal = await this.journalService.createJournal(
            {
                reference,
                description: `سحب مبلغ زكاة قدره ${amount}`,
                type: 'GENERAL',
                sourceType: 'ZAKAT',
                sourceId: undefined,
                lines: [
                    {
                        accountId: zakatAccount.id,
                        debit: amount,
                        credit: 0,
                        description: 'سحب مبلغ الزكاة من حساب الزكاة',
                    },
                    {
                        accountId: bankAccount.id,
                        debit: 0,
                        credit: amount,
                        description: 'سحب مبلغ الزكاة من الحساب البنكي',
                    },
                ],
            },
            userId,
        );

        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Zakat',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بسحب مبلغ زكاة قدره ${amount}`,
            },
        });

        return {
            message: "تم سحب مبلغ الزكاة بنجاح",
            journalId: journal.journal.id
        };
    }

    async getZakatAccountReport(month?: string) {
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

        // Fetch zakat account with posted journal entries
        const zakatAccount = await this.prisma.account.findUnique({
            where: { code: '20001' }, // zakat account code
            include: {
                entries: {
                    where: {
                        journal: {
                            status: 'POSTED',
                            ...(monthStart && monthEnd ? { date: { gte: monthStart, lte: monthEnd } } : {}),
                        },
                    },
                    include: {
                        journal: {
                            include: {
                                postedBy: { select: { id: true, name: true } },
                            },
                        },
                        client: { select: { id: true, name: true } },
                    },
                    orderBy: { id: 'desc' },
                },
            },
        });

        if (!zakatAccount) throw new NotFoundException('Zakat account not found');

        // Group journal entries by month (Saudi timezone)
        const groupedByMonth = zakatAccount.entries.reduce((acc, entry) => {
            const date = DateTime.fromJSDate(entry.journal.date).setZone('Asia/Riyadh');
            const monthKey = date.toFormat('yyyy-LL');

            if (!acc[monthKey]) {
                acc[monthKey] = { entries: [], totalDebit: 0, totalCredit: 0, totalBalance: 0, requiredZakat: 0 };
            }

            const mapped = {
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
            };

            acc[monthKey].entries.push(mapped);
            acc[monthKey].totalDebit += entry.debit ?? 0;
            acc[monthKey].totalCredit += entry.credit ?? 0;
            acc[monthKey].totalBalance += entry.balance ?? 0;

            return acc;
        }, {} as Record<string, { entries: any[]; totalDebit: number; totalCredit: number; totalBalance: number, requiredZakat: number }>);
        const zakatAccruals = await this.prisma.zakatAccrual.findMany({
            where: {
                ...(monthStart && monthEnd
                    ? {
                        year: Number(month?.split('-')[0]),
                        month: Number(month?.split('-')[1]),
                    }
                    : {}),
            },
        });

        // If no journal entries, create the month entry manually
        if (Object.keys(groupedByMonth).length === 0) {
            // Determine which month to use
            let monthKey: string;
            let yearNum: number;
            let monthNum: number;

            if (month) {
                [yearNum, monthNum] = month.split('-').map(Number);
            } else {
                const now = DateTime.now().setZone('Asia/Riyadh');
                yearNum = now.year;
                monthNum = now.month;
            }

            monthKey = `${yearNum}-${monthNum.toString().padStart(2, '0')}`;

            const monthTotal = zakatAccruals
                .filter((z) => z.year === yearNum && z.month === monthNum)
                .reduce((sum, z) => sum + z.amount, 0);

            groupedByMonth[monthKey] = {
                entries: [],
                totalDebit: 0,
                totalCredit: 0,
                totalBalance: 0,
                requiredZakat: monthTotal,
            };
        }

        // Merge required zakat per month
        Object.keys(groupedByMonth).forEach((monthKey) => {
            const [year, monthNum] = monthKey.split('-').map(Number);

            const monthTotal = zakatAccruals
                .filter((z) => z.year === year && z.month === monthNum)
                .reduce((sum, z) => sum + z.amount, 0);

            groupedByMonth[monthKey].requiredZakat = monthTotal;
        });

        // return final
        return {
            account: {
                id: zakatAccount.id,
                name: zakatAccount.name,
                code: zakatAccount.code,
                debit: zakatAccount.debit,
                credit: zakatAccount.credit,
                balance: zakatAccount.balance,
            },
            totalJournalEntries: zakatAccount.entries.length,
            journalsByMonth: groupedByMonth,
        };
    }
}