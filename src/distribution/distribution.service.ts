import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class DistributionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // Post closing journal for a period 
    async postClosing(periodId: number, userId: number, savingPercentage?: number) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Period not found');

        if (period.isClosed === false) throw new BadRequestException('Period is not closed');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        const closingJournalId = period.closingJournalId || 0;
        await this.journalService.postJournal(closingJournalId, userId);

        // Get partner accruals for this period
        const accruals = await this.prisma.partnerPeriodProfit.findMany({
            where: { periodId: periodId },
            include: { partner: true },
        });

        if (!accruals.length) throw new BadRequestException('No partner accruals to post');

        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount) throw new BadRequestException('saving account (20002) must exist');

        if (savingPercentage && savingPercentage > 0) {
            for (const acc of accruals) {
                const partner = acc.partner;
                const totalProfit = Number(acc.totalProfit);

                const savingAmount = (totalProfit * savingPercentage) / 100;

                const savingRecord = await this.prisma.partnerSavingAccrual.create({
                    data: {
                        partnerId: partner.id,
                        periodId: periodId,
                        accrualId: acc.id,
                        savingAmount: savingAmount,
                    },
                });

                await this.journalService.createJournal(
                    {
                        reference: `SAVE-${partner.id}-${periodId}`,
                        description: `ادخار بنسبة ${savingPercentage}% للشريك ${partner.name}`,
                        type: 'GENERAL',
                        sourceType: 'SAVING',
                        sourceId: savingRecord.id,
                        lines: [
                            {
                                accountId: savingAccount.id,
                                debit: 0,
                                credit: savingAmount,
                                description: `تسجيل ادخار (${savingPercentage}%)`,
                            },
                            {
                                accountId: partner.accountPayableId,
                                debit: savingAmount,
                                credit: 0,
                                description: `خصم ادخار للشريك ${partner.name}`,
                            },
                        ],
                    },
                    userId,
                );
            }
        }

        // Mark all accruals for this period as distributed
        await this.prisma.partnerShareAccrual.updateMany({
            where: { periodId: periodId },
            data: { isDistributed: true },
        });


        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Distribution',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتوزيع ارباح الفترة ${period.name} بنجاح.`,
            },
        });

        return { message: 'Period posted successfully', closingJournalId };
    }

    // Reverse the posted closing journal
    async reverseClosing(periodId: number, userId: number) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Period not found');

        if (period.isClosed === false) throw new BadRequestException('Period is not closed');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        const closingJournalId = period.closingJournalId || 0;

        await this.journalService.unpostJournal(userId, closingJournalId);

        const savingAccruals = await this.prisma.partnerSavingAccrual.findMany({
            where: { periodId },
        });

        for (const s of savingAccruals) {
            const savingJournal = await this.prisma.journalHeader.findFirst({
                where: {
                    sourceType: 'SAVING',
                    sourceId: s.id,
                },
            });

            if (savingJournal) {
                await this.journalService.unpostJournal(userId, savingJournal.id);

                await this.prisma.journalLine.deleteMany({
                    where: {
                        journalId: savingJournal?.id,
                    },
                });

                await this.prisma.journalHeader.deleteMany({
                    where: {
                        id: savingJournal.id
                    },
                },
                );
            }
        }

        await this.prisma.partnerSavingAccrual.deleteMany({
            where: { periodId },
        });

        await this.prisma.partnerShareAccrual.updateMany({
            where: { periodId },
            data: { isDistributed: false },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Distribution',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بعكس توزيع ارباح الفترة ${period.name} بنجاح.`,
            },
        });

        return { message: 'تم الغاء توزيع الفترة بنجاح', periodId };
    }

    // Get closed periods
    async getClosedPeriods() {
        const periods = await this.prisma.periodHeader.findMany({
            where: { isClosed: true },
            include: {
                PartnerPeriodProfit: { include: { partner: true } },
                journals: { include: { lines: { include: { account: true } } } }
            },
            orderBy: { startDate: 'desc' }
        });

        // get the closing journal header
        const closingJournal = await this.prisma.journalHeader.findUnique({
            where: { id: periods[0]?.closingJournalId || 0 },
        });

        return periods.map(p => {
            const companyProfit = p.journals
                .flatMap(j => j.lines)
                .filter(l => l.account.accountBasicType === 'COMPANY_SHARES')
                .reduce((sum, l) => sum + Number(l.credit), 0);

            const partners = p.PartnerPeriodProfit.map(pp => ({
                partnerId: pp.partnerId,
                partnerName: pp.partner.name,
                totalProfit: Number(pp.totalProfit)
            }));

            return {
                periodId: p.id,
                name: p.name,
                startDate: p.startDate,
                endDate: p.endDate,
                closingJournalId: p.closingJournalId,
                isdistributed: closingJournal?.status === 'POSTED',
                companyProfit,
                partners
            };
        });
    }
}