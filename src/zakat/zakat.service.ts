import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DateTime } from 'luxon';
import moment from "moment-hijri";
import HijriDate from 'hijri-date/lib/safe';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';

type ZakatYearSummary = {
    partnerId: number;
    partnerName: string;
    capitalAmount: number;
    year: number;
    currentAnnualZakat: number;
    annualZakat: number;
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

    private round2(v: number) {
        return Math.round((v + Number.EPSILON) * 100) / 100;
    }

    private numberToArabicWords(num: number): string {
        const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
        const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
        const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

        if (num === 0) return 'صفر';
        if (num < 10) return ones[num];

        let words = '';
        const h = Math.floor(num / 100);
        const t = Math.floor((num % 100) / 10);
        const o = num % 10;

        if (h > 0) words += hundreds[h] + ' ';
        if (t > 1) {
            words += tens[t] + ' ';
            if (o > 0) words += 'و' + ones[o] + ' ';
        } else if (t === 1) {
            if (o === 0) words += 'عشرة';
            else if (o === 1) words += 'أحد عشر';
            else if (o === 2) words += 'اثنا عشر';
            else words += ones[o] + ' عشر';
        } else {
            if (o > 0) words += ones[o] + ' ';
        }

        return words.trim();
    }

    private fillTemplate(template: string, context: Record<string, any>): string {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
            const value = context[key.trim()];
            return value !== undefined ? String(value) : '';
        });
    }

    private async generatePdfFromHtml(html: string, filename: string): Promise<string> {
        const dir = path.join(process.cwd(), 'uploads', 'zakat');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        return filePath;
    }

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


        const buildYearSummary = async (yr: number): Promise<ZakatYearSummary | null> => {
            const baseCapital = Number(partner.capitalAmount ?? 0);

            const newCapitalAmount = partner.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);

            const totalAmount = baseCapital + newCapitalAmount;


            const accruals = await this.prisma.zakatAccrual.findMany({
                where: { partnerId, year: yr },
                orderBy: { month: 'asc' },
            });


            if (accruals.length === 0) {
                return null;
            }


            const annualZakat = accruals.reduce((sum, acc) => sum + acc.amount, 0);


            const paymentsAggregate = await this.prisma.zakatPayment.aggregate({
                where: { partnerId, year: yr },
                _sum: { amount: true },
            });

            const paymentsWithVouchers = await this.prisma.zakatPayment.findMany({
                where: { partnerId, year: yr },
                select: { month: true, PAYMENT_VOUCHER: true, amount: true },
            });

            const totalPaid = paymentsAggregate._sum.amount || 0;
            const remaining = annualZakat - totalPaid;
            const currentAnnualZakat = Number((totalAmount * 0.025).toFixed(2));


            const monthlyBreakdown = accruals.map((acc) => {
                const payment = paymentsWithVouchers.find(p => p.month === acc.month);
                return {
                    ...acc,
                    status: payment ? 'PAID' : 'NOT_PAID',
                    paymentVoucher: payment?.PAYMENT_VOUCHER || null,
                    paidAmount: payment?.amount || 0,
                };
            });

            return {
                partnerId,
                partnerName: partner.name,
                capitalAmount: totalAmount,
                year: yr,
                currentAnnualZakat: currentAnnualZakat ?? 0,
                annualZakat,
                totalPaid,
                remaining: remaining < 0 ? 0 : Number(remaining.toFixed(2)),
                monthlyBreakdown,
            };
        };


        if (year) {
            const result = await buildYearSummary(year);
            if (!result) {
                throw new NotFoundException(`No zakat accrual found for partner in year ${year}`);
            }
            return result;
        }


        const allAccruals = await this.prisma.zakatAccrual.findMany({
            where: { partnerId },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });

        const distinctYears = [...new Set(allAccruals.map((a) => a.year))];

        const results: ZakatYearSummary[] = [];

        for (const yr of distinctYears) {
            const summary = await buildYearSummary(yr);
            if (summary) {
                results.push(summary);
            }
        }

        return results;
    }

    async getYearlyAllPartners(year: number, page: number = 1, limit?: number) {
        const pageLimit = limit && limit > 0 ? limit : 10;
        const skip = (page - 1) * pageLimit;


        const partnersWithAccruals = await this.prisma.partner.findMany({
            where: {
                WithdrawingStatus: 'ACTIVE',
                ZakatAccrual: {
                    some: { year },
                },
            },
            select: { id: true },
        });

        const partnersWithAccrualsIds = partnersWithAccruals.map(p => p.id);

        const totalPartners = partnersWithAccrualsIds.length;
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
                WithdrawingStatus: 'ACTIVE',
                id: { in: partnersWithAccrualsIds },
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
            const baseCapital = Number(p.capitalAmount ?? 0);

            const newCapitalAmount = p.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);

            const totalAmount = baseCapital + newCapitalAmount;
            const currentAnnualZakat = Number((totalAmount * 0.025).toFixed(2));


            const annualZakat = p.ZakatAccrual.reduce((sum, acc) => sum + acc.amount, 0);


            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });
            const totalPaid = payments._sum.amount || 0;
            const remaining = annualZakat - totalPaid;


            const monthlyBreakdown = p.ZakatAccrual.map((acc) => ({
                ...acc,
                status: totalPaid > 0 ? 'PAID' : 'NOT_PAID',
                paymentVoucher: null,
            }));

            results.push({
                partnerId: p.id,
                partnerName: p.name,
                capitalAmount: totalAmount,
                year,
                currentAnnualZakat: currentAnnualZakat,
                annualZakat,
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

        const zakatWithdrawals = await this.prisma.zakatWithdraw.findMany({
            select: { id: true, amount: true, document: true, createdAt: true },
        });

        const zakatWithdrawalsWithSaudiTime = zakatWithdrawals.map(w => ({
            ...w,
            createdAt: DateTime.fromJSDate(w.createdAt)
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd'),
        }));
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
            zakatWithdrawals: zakatWithdrawalsWithSaudiTime,
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

    async reverseZakatWithdrawal(
        zakatWithdrawId: number,
        userId: number,
    ) {
        const zakatWithdraw = await this.prisma.zakatWithdraw.findUnique({
            where: { id: zakatWithdrawId },
        });

        if (!zakatWithdraw) {
            throw new NotFoundException('عملية سحب الزكاة غير موجودة');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount) throw new BadRequestException('zakat account (20001) must exist');

        const bankAccount = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bankAccount) throw new NotFoundException("Bank account not found");


        const year = zakatWithdraw.createdAt.getFullYear();
        const month = zakatWithdraw.createdAt.getMonth() + 1;

        const zakatPayments = await this.prisma.zakatPayment.findMany({
            where: {
                zakatWithdrawId: zakatWithdraw.id
            },
            include: {
                partner: true,
            },
        });

        const amount = zakatWithdraw.amount;

        const originalJournal = await this.prisma.journalHeader.findFirst({
            where: {
                sourceType: 'ZAKAT',
                sourceId: zakatWithdraw.id,
                status: 'POSTED',
            },
        });

        if (!originalJournal) {
            throw new BadRequestException('لم يتم العثور على القيد الأصلي أو أن القيد غير معتمد');
        }

        await this.journalService.unpostJournal(userId, originalJournal.id);


        await this.prisma.$transaction(async (tx) => {
            for (const payment of zakatPayments) {
                await tx.partner.update({
                    where: { id: payment.partnerId },
                    data: {
                        capitalAmount: { increment: payment.amount },
                        totalAmount: { increment: payment.amount },
                        yearlyZakatPaid: { decrement: payment.amount },
                        yearlyZakatBalance: { increment: payment.amount },
                    },
                });


                await tx.zakatPayment.delete({
                    where: { id: payment.id },
                });
            }


            await tx.zakatWithdraw.delete({
                where: { id: zakatWithdrawId },
            });

            await tx.journalLine.deleteMany({
                where: { journalId: originalJournal.id },
            });

            await tx.journalHeader.delete({
                where: { id: originalJournal.id },
            });
        });

        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Zakat',
                action: 'DELETE',
                description: `قام المستخدم ${user?.name} بعكس سحب مبلغ زكاة قدره ${amount}`,
            },
        });

        return {
            message: "تم عكس عملية سحب الزكاة بنجاح وحذف القيد الأصلي",
            deletedJournalId: originalJournal.id,
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

        const zakatWithdraw = await this.prisma.zakatWithdraw.create({
            data: {
                amount: amount,
                userId: userId,
            }
        });

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const reference = `ZAKAT-WITHDRAW-${zakatWithdraw.id}-${year}-${month}`;

        const journal = await this.journalService.createJournal(
            {
                reference,
                description: `سحب مبلغ زكاة قدره ${amount}`,
                type: 'GENERAL',
                sourceType: 'ZAKAT',
                sourceId: zakatWithdraw.id,
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

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        const partners = await this.prisma.partner.findMany({
            where: {
                WithdrawingStatus: 'ACTIVE',
                yearlyZakatBalance: { gt: 0 },
            },
        });

        const totalZakatBalance = partners.reduce(
            (sum, p) => sum + (p.yearlyZakatBalance || 0),
            0
        );

        const createdPayments: number[] = [];

        await this.prisma.$transaction(async (tx) => {
            let totalDistributed = 0;

            for (let i = 0; i < partners.length; i++) {
                const partner = partners[i];
                const isLast = i === partners.length - 1;

                let roundedShare: number;

                if (isLast) {
                    roundedShare = Math.round((amount - totalDistributed) * 100) / 100;
                } else {
                    const share = ((partner.yearlyZakatBalance || 0) / totalZakatBalance) * amount;
                    roundedShare = Math.round(share * 100) / 100;
                    totalDistributed += roundedShare;
                }

                const zakatPayment = await tx.zakatPayment.create({
                    data: {
                        zakatWithdrawId: zakatWithdraw.id,
                        partnerId: partner.id,
                        amount: roundedShare,
                        year,
                        month,
                    },
                });

                createdPayments.push(zakatPayment.id);

                await tx.partner.update({
                    where: { id: partner.id },
                    data: {
                        capitalAmount: { decrement: roundedShare },
                        totalAmount: { decrement: roundedShare },
                        yearlyZakatPaid: { increment: roundedShare },
                        yearlyZakatBalance: { decrement: roundedShare },
                    },
                });
            }
        }, { timeout: 15000 });

        const template = await this.prisma.template.findUnique({
            where: { name: 'PAYMENT_VOUCHER' },
        });

        if (template) {
            for (const paymentId of createdPayments) {
                const zakatPayment = await this.prisma.zakatPayment.findUnique({
                    where: { id: paymentId },
                    include: { partner: true },
                });

                if (!zakatPayment) continue;

                const partner = zakatPayment.partner;

                const todayG = DateTime.now().setZone('Asia/Riyadh').toFormat('yyyy-MM-dd');
                const todayH = new HijriDate();
                const hijriDateFormatted = `${todayH.getFullYear()}-${todayH.getMonth() + 1}-${todayH.getDate()}`;

                const context = {
                    رقم_السند: zakatPayment.id,
                    التاريخ_الهجري: hijriDateFormatted,
                    التاريخ_الميلادي: todayG,
                    سبب_الصرف: `دفع زكاة مستحقة  ${month}-${year}`,
                    المبلغ_رقما: zakatPayment.amount.toFixed(2),
                    المبلغ_كتابة: this.numberToArabicWords(zakatPayment.amount),
                    اسم_المساهم: partner.name,
                    رقم_هوية_المساهم: partner.nationalId ?? '---',
                    اسم_المستلم: partner.name,
                    رقم_هوية_المستلم: partner.nationalId ?? '---',
                };

                const filledHtml = this.fillTemplate(template.content, context);
                const pdfFilename = `zakat-${zakatPayment.id}.pdf`;
                const pdfPath = await this.generatePdfFromHtml(filledHtml, pdfFilename);
                const fileUrl = `${process.env.URL}uploads/zakat/${pdfFilename}`;

                await this.prisma.zakatPayment.update({
                    where: { id: zakatPayment.id },
                    data: { PAYMENT_VOUCHER: fileUrl },
                });

                console.log(`PDF generated for partner ${partner.name}`);
            }
        } else {
            console.warn(`Template PAYMENT_VOUCHER not found, skipping PDF generation`);
        }

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
            journalId: journal.journal.id,
            zakatWithdrawId: zakatWithdraw.id,
        };
    }
}