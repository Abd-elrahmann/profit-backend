import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import moment from 'moment-timezone';

@Injectable()
export class ZakatSchedulerService {
    private readonly logger = new Logger(ZakatSchedulerService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // MONTHLY PAYMENT JOB — runs on 1st of every month    
    @Cron('5 0 1 * *', {
        timeZone: 'Asia/Riyadh',
    })
    async runMonthlyZakat() {
        const now = moment().tz('Asia/Riyadh');
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

            // 1) Create ZakatPayment
            await this.prisma.zakatPayment.create({
                data: {
                    partnerId: partner.id,
                    year,
                    month,
                    amount: acc.amount,
                },
            });

            // 2) Create Journal Entry
            await this.journalService.createJournal(
                {
                    reference: `ZAKAT-${partner.id}-${year}-${month}`,
                    description: `دفع زكاة شهرية لشريك ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'ZAKAT',
                    sourceId: partner.id,
                    lines: [
                        {
                            // Zakat Expense (credit)
                            accountId: zakat.id,
                            debit: 0,
                            credit: acc.amount,
                            description: 'مصروف زكاة',
                        },
                        {
                            // Partner Equity (debit)
                            accountId: partner.accountEquityId,
                            debit: acc.amount,
                            credit: 0,
                            description: 'التزام زكاة',
                        },
                    ],
                },
                1,
            );

            // 3) Update partner yearly totals
            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    yearlyZakatPaid: {
                        increment: acc.amount,
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
            const annualZakat = p.capitalAmount * 0.025;

            const paid = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });

            const paidAmount = paid._sum.amount || 0;
            const diff = annualZakat - paidAmount;

            if (diff !== 0) {
                // Create journal entry for difference
                await this.journalService.createJournal(
                    {
                        reference: `ZAKAT-YEAR-END-${p.id}-${year}`,
                        description: `تسوية زكاة نهاية السنة لشريك ${p.name}`,
                        type: 'ADJUSTMENT',
                        sourceType: 'ZAKAT',
                        sourceId: p.id,
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
                    yearlyZakatBalance: diff,
                    yearlyZakatRequired: annualZakat,
                    yearlyZakatPaid: paidAmount,
                },
            });
        }

        this.logger.log(`Year-end zakat reconciliation completed.`);
    }
}