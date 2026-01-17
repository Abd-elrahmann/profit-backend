import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DateTime } from 'luxon';
import moment from "moment-hijri";
import * as fs from 'fs';
import * as path from 'path';

type ZakatYearSummary = {
    partnerId: number;
    partnerName: string;
    capitalAmount: number;
    year: number;
    currentAnnualZakat: number;
    currentMonthlyZakat: number;
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

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }


    async getPartnerZakatSummary(partnerId: number, year?: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: { PartnerNewCapital: { select: { amount: true, remaining: true } } }
        });

        if (!partner) throw new NotFoundException('Partner not found');


        const buildYearSummary = async (yr: number): Promise<ZakatYearSummary> => {


            const partnerStartYear = partner.createdAt ? new Date(partner.createdAt).getFullYear() : yr;
            const startMonth = yr === partnerStartYear
                ? new Date(partner.createdAt).getMonth() + 1
                : 1;

            const baseCapital = Number(partner.capitalAmount ?? 0);

            const newCapitalAmount = partner.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);

            const totalAmount = baseCapital + newCapitalAmount;
            const remainingMonths = 12 - startMonth + 1;

            const annualZakat = partner.yearlyZakatRequired ?? 0;
            const monthlyZakat = Number((annualZakat / remainingMonths).toFixed(2));

            const currentAnnualZakat = Number((totalAmount * 0.025).toFixed(2));
            const currentMonthlyZakat = currentAnnualZakat / remainingMonths;


            const accruals = await this.prisma.zakatAccrual.findMany({
                where: { partnerId, year: yr },
                orderBy: { month: 'asc' },
            });


            const payments = await this.prisma.zakatPayment.findMany({
                where: { partnerId, year: yr },
            });


            const monthlyWithStatus = await Promise.all(
                accruals.map(async (acc) => {

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
                capitalAmount: totalAmount,
                year: yr,
                currentAnnualZakat: currentAnnualZakat ?? 0,
                currentMonthlyZakat: currentMonthlyZakat,
                annualZakat,
                monthlyZakat,
                totalPaid,
                remaining: remaining < 0 ? 0 : Number(remaining.toFixed(2)),
                monthlyBreakdown: monthlyWithStatus,
            };
        };


        if (year) {
            return await buildYearSummary(year);
        }


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
                    { ZakatAccrual: { some: { year } } },
                    { ZakatPayment: { some: { year } } },
                ],
            },
        });

        const totalPages = Math.ceil(totalPartners / pageLimit);
        if (page > totalPages && totalPartners > 0) throw new NotFoundException('Page not found');

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


        const partners = await this.prisma.partner.findMany({
            where: {
                OR: [
                    { ZakatAccrual: { some: { year } } },
                    { ZakatPayment: { some: { year } } },
                ],
            },
            skip,
            take: pageLimit,
            orderBy: { id: 'asc' },
            include: {
                PartnerNewCapital: { select: { amount: true, remaining: true } },
                ZakatAccrual: { where: { year }, orderBy: { month: 'asc' } },
            },
        });

        const results: ZakatYearSummary[] = [];

        for (const p of partners) {
            const partnerStartYear = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
            const startMonth = year === partnerStartYear
                ? new Date(p.createdAt).getMonth() + 1
                : 1;

            const remainingMonths = 12 - startMonth + 1;

            const baseCapital = Number(p.capitalAmount ?? 0);

            const newCapitalAmount = p.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);

            const totalAmount = baseCapital + newCapitalAmount;

            const annualZakat = p.yearlyZakatRequired ?? 0;
            const monthlyZakat = Number((annualZakat / remainingMonths).toFixed(2));

            const currentAnnualZakat = Number((totalAmount * 0.025).toFixed(2));
            const currentMonthlyZakat = currentAnnualZakat / remainingMonths;


            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });
            const totalPaid = payments._sum.amount || 0;
            const remaining = annualZakat ? annualZakat - totalPaid : currentAnnualZakat - totalPaid;


            const monthlyBreakdown = await Promise.all(
                p.ZakatAccrual.map(async (acc) => {
                    const payment = await this.prisma.zakatPayment.findFirst({
                        where: { partnerId: p.id, year, month: acc.month },
                    });

                    let status: 'PAID' | 'NOT_PAID' = 'NOT_PAID';
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
                        paymentVoucher: payment?.PAYMENT_VOUCHER,
                    };
                })
            );

            results.push({
                partnerId: p.id,
                partnerName: p.name,
                capitalAmount: totalAmount,
                year,
                currentAnnualZakat: currentAnnualZakat,
                currentMonthlyZakat: currentMonthlyZakat,
                annualZakat,
                monthlyZakat,
                totalPaid,
                remaining: remaining < 0 ? 0 : Number(remaining.toFixed(2)),
                monthlyBreakdown,
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

        if (bankAccount.balance < amount) {
            throw new BadRequestException("الرصيد في الصندوق غير كافٍ للسحب");
        }

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

        await this.journalService.postJournal(journal.journal.id, userId);

        await this.prisma.zakatWithdraw.create({
            data: {
                amount: amount,
                userId: userId,
            }
        })

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


        const zakatAccount = await this.prisma.account.findUnique({
            where: { code: '20001' }, 
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


        const groupedByMonth = zakatAccount.entries.reduce((acc, entry) => {
            const date = DateTime.fromJSDate(entry.journal.date).setZone('Asia/Riyadh');
            const monthKey = date.toFormat('yyyy-LL');

            if (!acc[monthKey]) {
                acc[monthKey] = { entries: [], totalDebit: 0, totalCredit: 0, totalBalance: 0, requiredZakat: 0 };
            }

            const mapped = {
                id: entry.journal.id,
                date: date.toISO(),
                hijriDate: this.toHijri(entry.journal.date),
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


        if (Object.keys(groupedByMonth).length === 0) {

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


        Object.keys(groupedByMonth).forEach((monthKey) => {
            const [year, monthNum] = monthKey.split('-').map(Number);

            const monthTotal = zakatAccruals
                .filter((z) => z.year === year && z.month === monthNum)
                .reduce((sum, z) => sum + z.amount, 0);

            groupedByMonth[monthKey].requiredZakat = monthTotal;
        });


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

    async uploadDocument(currentUser, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const uploadDir = path.join(process.cwd(), 'uploads', 'zakat');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filePath = path.join(uploadDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        const zakatWithdraw = await this.prisma.zakatWithdraw.findFirst({
            where: { userId: currentUser },
            orderBy: { createdAt: 'desc' },
        });

        await this.prisma.zakatWithdraw.update({
            where: { id: zakatWithdraw?.id },
            data: { document: publicUrl },
        });

        return { message: 'تم رفع المستند بنجاح', path: publicUrl };
    }
}