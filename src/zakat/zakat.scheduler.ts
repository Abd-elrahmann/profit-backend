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

        return filePath;
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }


    // @Cron('5 0 28-31 * *', {
    //     timeZone: 'Asia/Riyadh',
    // })
    // async runMonthlyZakat() {
    //     const now = moment().tz('Asia/Riyadh');

    //     const today = now.date();
    //     const lastDay = now.endOf('month').date();

    //     if (today !== lastDay) {
    //         return;
    //     }

    //     const year = now.year();
    //     const month = now.month() + 1;

    //     const accruals = await this.prisma.zakatAccrual.findMany({
    //         where: { year, month },
    //         include: { partner: true },
    //     });

    //     const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
    //     if (!zakat) throw new BadRequestException('zakat account (20001) must exist');

    //     for (const acc of accruals) {
    //         const partner = acc.partner;
    //         const amount = this.round2(acc.amount);


    //         const zakatPayment = await this.prisma.zakatPayment.create({
    //             data: {
    //                 partnerId: partner.id,
    //                 year,
    //                 month,
    //                 amount,
    //             },
    //         });


    //         const journal = await this.journalService.createJournal(
    //             {
    //                 reference: `ZAKAT-${partner.id}-${year}-${month}`,
    //                 description: `دفع زكاة شهرية لشريك ${partner.name}`,
    //                 type: 'GENERAL',
    //                 sourceType: 'ZAKAT',
    //                 sourceId: zakatPayment.id,
    //                 lines: [
    //                     {

    //                         accountId: zakat.id,
    //                         debit: 0,
    //                         credit: amount,
    //                         description: 'مصروف زكاة',
    //                     },
    //                     {

    //                         accountId: partner.accountEquityId,
    //                         debit: amount,
    //                         credit: 0,
    //                         description: 'التزام زكاة',
    //                     },
    //                 ],
    //             },
    //             1,
    //         );

    //         await this.journalService.postJournal(journal.journal.id, 1)

    //         const template = await this.prisma.template.findUnique({
    //             where: { name: 'PAYMENT_VOUCHER' },
    //         });

    //         if (!template) {
    //             continue;
    //         }

    //         const todayG = DateTime.now().setZone('Asia/Riyadh').toFormat('yyyy-MM-dd');
    //         const todayH = new HijriDate();
    //         const hijriDateFormatted = `${todayH.getFullYear()}-${todayH.getMonth() + 1}-${todayH.getDate()}`;

    //         const context = {
    //             رقم_السند: zakatPayment.id,
    //             التاريخ_الهجري: hijriDateFormatted,
    //             التاريخ_الميلادي: todayG,
    //             سبب_الصرف: `دفع زكاة مستحقة لشهر ${month}-${year}`,
    //             المبلغ_رقما: amount.toFixed(2),
    //             المبلغ_كتابة: this.numberToArabicWords(amount),
    //             اسم_المساهم: partner.name,
    //             رقم_هوية_المساهم: partner.nationalId ?? '---',
    //             اسم_المستلم: partner.name,
    //             رقم_هوية_المستلم: partner.nationalId ?? '---',
    //         };

    //         const filledHtml = this.fillTemplate(template.content, context);

    //         const pdfFilename = `zakat-${zakatPayment.id}.pdf`;
    //         const pdfPath = await this.generatePdfFromHtml(filledHtml, pdfFilename);

    //         const fileUrl = `${process.env.URL}uploads/zakat/${pdfFilename}`;


    //         await this.prisma.zakatPayment.update({
    //             where: { id: zakatPayment.id },
    //             data: {
    //                 PAYMENT_VOUCHER: fileUrl,
    //             },
    //         });


    //         await this.prisma.partner.update({
    //             where: { id: partner.id },
    //             data: {
    //                 capitalAmount: { decrement: amount },
    //                 totalAmount: { decrement: amount },
    //                 yearlyZakatPaid: {
    //                     increment: amount,
    //                 },
    //             },
    //         });
    //     }
    // }

    @Cron('5 0 28-31 * *', { timeZone: 'Asia/Riyadh' })
    async runMonthlyZakat() {
        const now = moment().tz('Asia/Riyadh');

        const today = now.date();
        const lastDay = now.endOf('month').date();

        if (today !== lastDay) {
            return;
        }

        const year = now.year();
        const month = now.month() + 1;

        const accruals = await this.prisma.zakatAccrual.findMany({
            where: { year, month },
            include: { partner: true },
        });

        this.logger.log(`Found ${accruals.length} accruals for ${year}-${month}`);

        for (const acc of accruals) {
            try {
                const partner = acc.partner;
                const amount = this.round2(acc.amount);

                this.logger.log(`Processing zakat for partner ${partner.name} (ID: ${partner.id})`);

                const existingPayment = await this.prisma.zakatPayment.findFirst({
                    where: {
                        partnerId: partner.id,
                        year,
                        month,
                    }
                });

                if (existingPayment) {
                    this.logger.warn(`Payment already exists for partner ${partner.name}, skipping`);
                    continue;
                }

                const zakatPayment = await this.prisma.zakatPayment.create({
                    data: {
                        partnerId: partner.id,
                        year,
                        month,
                        amount,
                    },
                });

                const zakat = await this.prisma.account.findUnique({ where: { code: '20001' } });
                if (!zakat) throw new BadRequestException('zakat account (20001) must exist');

                const journal = await this.journalService.createJournal(
                    {
                        reference: `ZAKAT-${partner.id}-${year}-${month}`,
                        description: `دفع زكاة شهرية لشريك ${partner.name}`,
                        type: 'GENERAL',
                        sourceType: 'ZAKAT',
                        sourceId: zakatPayment.id,
                        lines: [
                            {
                                accountId: zakat.id,
                                debit: 0,
                                credit: amount,
                                description: 'مصروف زكاة',
                            },
                            {
                                accountId: partner.accountEquityId,
                                debit: amount,
                                credit: 0,
                                description: 'التزام زكاة',
                            },
                        ],
                    },
                    1,
                );

                await this.journalService.postJournal(journal.journal.id, 1);

                this.logger.log(`Journal created and posted for partner ${partner.name}`);

                // PDF Generation with error handling
                try {
                    const template = await this.prisma.template.findUnique({
                        where: { name: 'PAYMENT_VOUCHER' },
                    });

                    if (template) {
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

                        await this.prisma.zakatPayment.update({
                            where: { id: zakatPayment.id },
                            data: { PAYMENT_VOUCHER: fileUrl },
                        });

                        this.logger.log(`PDF generated for partner ${partner.name}`);
                    } else {
                        this.logger.warn(`Template PAYMENT_VOUCHER not found, skipping PDF generation`);
                    }
                } catch (pdfError) {
                    this.logger.error(`PDF generation failed for partner ${partner.name}:`, pdfError);
                    // Continue processing - payment is still recorded
                }

                // Update partner
                await this.prisma.partner.update({
                    where: { id: partner.id },
                    data: {
                        capitalAmount: { decrement: amount },
                        totalAmount: { decrement: amount },
                        yearlyZakatPaid: { increment: amount },
                    },
                });

                this.logger.log(`Successfully processed zakat for partner ${partner.name}`);

            } catch (error) {
                this.logger.error(`Failed to process zakat for partner ${acc.partner.name}:`, error);
                // Continue to next partner instead of breaking entire loop
            }
        }

        this.logger.log(`Monthly zakat processing completed for ${year}-${month}`);
    }


    @Cron('55 23 31 12 *', {
        timeZone: 'Asia/Riyadh',
    })
    async runYearEndZakatSettlement() {
        const year = moment().tz('Asia/Riyadh').year();

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
    }


    @Cron('0 0 1 1 *', {
        timeZone: 'Asia/Riyadh',
    })
    async runNextYearZakatAccruals() {
        const now = moment().tz('Asia/Riyadh');
        const nextYear = now.year() + 1;

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
        }
    }
}