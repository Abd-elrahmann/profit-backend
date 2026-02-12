import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import moment from 'moment-timezone';


@Injectable()
export class ZakatSchedulerService {
    private readonly logger = new Logger(ZakatSchedulerService.name);

    private round2(v: number) {
        return Math.round((v + Number.EPSILON) * 100) / 100;
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

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
                const journal = await this.journalService.createJournal(
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
                await this.journalService.postJournal(journal.journal.id, 1);
            }

            await this.prisma.partner.update({
                where: { id: p.id },
                data: {
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
        const year = moment().tz('Asia/Riyadh').year();

        const partners = await this.prisma.partner.findMany();

        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount) throw new BadRequestException('Zakat account (20001) must exist');

        for (const partner of partners) {
            const annualZakat = this.round2(partner.totalAmount * 0.025);
            const balance = partner.yearlyZakatBalance || 0;
            const totalZakat = this.round2(annualZakat + balance);

            if (annualZakat <= 0) continue;

            const journal = await this.journalService.createJournal(
                {
                    reference: `ZAKAT-ACCRUAL-${partner.id}-${year}`,
                    description: `إثبات استحقاق زكاة السنة الجديدة للشريك ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'ZAKAT',
                    sourceId: partner.id,
                    lines: [
                        {
                            accountId: zakatAccount.id,
                            debit: 0,
                            credit: annualZakat,
                            description: 'إثبات استحقاق زكاة السنة',
                        },
                        {
                            accountId: partner.accountEquityId,
                            debit: annualZakat,
                            credit: 0,
                            description: 'تحميل الزكاة على حقوق الشريك',
                        },
                    ],
                },
                1,
            );
            await this.journalService.postJournal(journal.journal.id, 1);

            await this.prisma.zakatAccrual.create({
                data: {
                    partnerId: partner.id,
                    year,
                    month: 1,
                    amount: annualZakat,
                },
            });

            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    yearlyZakatBalance: totalZakat,
                    yearlyZakatRequired: totalZakat,
                    yearlyZakatPaid: 0,
                },
            });
        }
    }
}