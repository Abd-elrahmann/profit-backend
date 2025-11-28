import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import moment from 'moment-timezone';
import { DateTime } from 'luxon';
import HijriDate from 'hijri-date/lib/safe';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';

@Injectable()
export class ZakatSchedulerService {
    private readonly logger = new Logger(ZakatSchedulerService.name);

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
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: filePath, format: 'A4', printBackground: true });
        await browser.close();

        return filePath; // path to save in DB
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // MONTHLY PAYMENT JOB — Runs at 00:05 on days 28,29,30,31
    @Cron('5 0 28-31 * *', {
        timeZone: 'Asia/Riyadh',
    })
    async runMonthlyZakat() {
        const now = moment().tz('Asia/Riyadh');

        const today = now.date();
        const lastDay = now.endOf('month').date();

        if (today !== lastDay) {
            this.logger.log(`Skipping... today is ${today}, last day is ${lastDay}`);
            return;
        }

        const year = now.year();
        const month = now.month() + 1;

        this.logger.log(`Running monthly zakat job for ${year}-${month}`);

        // Get all accruals for this month
        const accruals = await this.prisma.zakatAccrual.findMany({
            where: { year, month },
            include: { partner: true },
        });

        const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakat) throw new BadRequestException('zakat account (20001) must exist');

        for (const acc of accruals) {
            const partner = acc.partner;
            const amount = this.round2(acc.amount);

            // 1) Create ZakatPayment
            const zakatPayment = await this.prisma.zakatPayment.create({
                data: {
                    partnerId: partner.id,
                    year,
                    month,
                    amount,
                },
            });

            // 2) Create Journal Entry
            const journal = await this.journalService.createJournal(
                {
                    reference: `ZAKAT-${partner.id}-${year}-${month}`,
                    description: `دفع زكاة شهرية لشريك ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'ZAKAT',
                    sourceId: zakatPayment.id,
                    lines: [
                        {
                            // Zakat Expense (credit)
                            accountId: zakat.id,
                            debit: 0,
                            credit: amount,
                            description: 'مصروف زكاة',
                        },
                        {
                            // Partner Equity (debit)
                            accountId: partner.accountEquityId,
                            debit: amount,
                            credit: 0,
                            description: 'التزام زكاة',
                        },
                    ],
                },
                1,
            );

            await this.journalService.postJournal(journal.journal.id, 1)

            const template = await this.prisma.template.findUnique({
                where: { name: 'PAYMENT_VOUCHER' },
            });

            if (!template) {
                this.logger.error('PAYMENT_VOUCHER template missing!');
                continue;
            }

            const todayG = DateTime.now().setZone('Asia/Riyadh').toFormat('yyyy-MM-dd');
            const todayH = new HijriDate();
            const hijriDateFormatted = `${todayH.getFullYear()}-${todayH.getMonth() + 1}-${todayH.getDate()}`;

            const context = {
                رقم_السند: zakatPayment.id,
                التاريخ_الهجري: hijriDateFormatted,
                التاريخ_الميلادي: todayG,
                سبب_الصرف: `دفع زكاة مستحقة لشهر ${month}-${year}`,
                المبلغ_رقما: amount.toFixed(2),
                المبلغ_كتابة: this.numberToArabicWords(amount),
                اسم_المساهم: partner.name,
                رقم_هوية_المساهم: partner.nationalId ?? '---',
                اسم_المستلم: partner.name,
                رقم_هوية_المستلم: partner.nationalId ?? '---',
            };

            const filledHtml = this.fillTemplate(template.content, context);

            const pdfFilename = `zakat-${zakatPayment.id}.pdf`;
            const pdfPath = await this.generatePdfFromHtml(filledHtml, pdfFilename);

            const fileUrl = `${process.env.URL}uploads/zakat/${pdfFilename}`;

            // تحديث zakatPayment لحفظ مسار الـ PDF
            await this.prisma.zakatPayment.update({
                where: { id: zakatPayment.id },
                data: {
                    PAYMENT_VOUCHER: fileUrl,
                },
            });

            // Update partner yearly totals
            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    capitalAmount: { decrement: amount },
                    totalAmount: { decrement: amount },
                    yearlyZakatPaid: {
                        increment: amount,
                    },
                },
            });
        }

        this.logger.log(`Monthly zakat job completed.`);
    }

    // YEAR-END RECONCILIATION JOB — runs Dec 31st 23:55
    @Cron('55 23 31 12 *', {
        timeZone: 'Asia/Riyadh',
    })
    async runYearEndZakatSettlement() {
        const year = moment().tz('Asia/Riyadh').year();
        this.logger.log(`Running year-end zakat reconciliation for ${year}`);

        const partners = await this.prisma.partner.findMany();

        const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakat) throw new BadRequestException('zakat account (20001) must exist');

        for (const p of partners) {
            const annualZakat = this.round2(p.totalAmount * 0.025);

            const paid = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });

            const paidAmount = this.round2(paid._sum.amount || 0);
            const diff = this.round2(annualZakat - paidAmount);

            if (diff !== 0) {
                const zakatPayment = await this.prisma.zakatPayment.create({
                    data: {
                        partnerId: p.id,
                        year,
                        month: null,
                        amount: diff,
                    },
                });

                // Create journal entry for difference
                await this.journalService.createJournal(
                    {
                        reference: `ZAKAT-YEAR-END-${p.id}-${year}`,
                        description: `تسوية زكاة نهاية السنة لشريك ${p.name}`,
                        type: 'ADJUSTMENT',
                        sourceType: 'ZAKAT',
                        sourceId: zakatPayment.id,
                        lines: diff > 0
                            ? [
                                {
                                    accountId: zakat.id,
                                    debit: 0,
                                    credit: diff,
                                    description: 'مصروف زكاة إضافي',
                                },
                                {
                                    accountId: p.accountEquityId,
                                    debit: diff,
                                    credit: 0,
                                    description: 'التزام زكاة إضافية',
                                },
                            ]
                            : [
                                {
                                    accountId: p.accountEquityId,
                                    debit: 0,
                                    credit: Math.abs(diff),
                                    description: 'تخفيض التزام زكاة',
                                },
                                {
                                    accountId: zakat.id,
                                    debit: Math.abs(diff),
                                    credit: 0,
                                    description: 'فائض زكاة مرحل',
                                },
                            ],
                    },
                    1,
                );
            }

            // Update partner zakat fields
            await this.prisma.partner.update({
                where: { id: p.id },
                data: {
                    capitalAmount: { decrement: diff },
                    totalAmount: { decrement: diff },
                    yearlyZakatBalance: diff,
                    yearlyZakatRequired: annualZakat,
                    yearlyZakatPaid: paidAmount,
                },
            });
        }

        this.logger.log(`Year-end zakat reconciliation completed.`);
    }

    // NEXT YEAR ZAKAT ACCRUAL JOB - runs every January 1st at 00:00 Riyadh time
    @Cron('0 0 1 1 *', {
        timeZone: 'Asia/Riyadh',
    })
    async runNextYearZakatAccruals() {
        const now = moment().tz('Asia/Riyadh');
        const nextYear = now.year() + 1;

        this.logger.log(`Running next year zakat accruals for ${nextYear}`);

        const partners = await this.prisma.partner.findMany();

        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount) throw new BadRequestException('Zakat account (20001) must exist');

        for (const partner of partners) {
            const annualZakat = this.round2(partner.totalAmount * 0.025);
            const monthlyZakat = this.round2(annualZakat / 12);

            for (let month = 1; month <= 12; month++) {
                await this.prisma.zakatAccrual.create({
                    data: {
                        partnerId: partner.id,
                        year: nextYear,
                        month,
                        amount: monthlyZakat,
                    },
                });
            }
            this.logger.log(`Created 12 monthly zakat accruals for partner ${partner.name} (${partner.id})`);
        }
        this.logger.log(`Next year zakat accruals job completed for ${nextYear}`);
    }
}