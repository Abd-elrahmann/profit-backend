import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import moment from "moment-hijri";

@Injectable()
export class DistributionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    // Post closing journal for a period 
    async postClosing(periodId: number, userId: number, savingAmountInput?: number) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Period not found');

        if (period.isClosed === false) throw new BadRequestException('الفترة غير مغلقة');

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

        if (!accruals.length) throw new BadRequestException('لا توجد أرباح لتوزيعها لهذه الفترة');

        // Fetch posted journal lines to add amounts to partner totals
        const closingJournal = await this.prisma.journalHeader.findUnique({
            where: { id: closingJournalId },
            include: {
                lines: {
                    include: { account: true },
                },
            },
        });

        // Build a map of partner ID to total debit amounts from journal lines
        const partnerAmountMap = new Map<number, number>();
        if (closingJournal && closingJournal.lines.length > 0) {
            for (const line of closingJournal.lines) {
                // Find which partner this line belongs to (by matching accountPayableId or accountEquityId)
                for (const accrual of accruals) {
                    const partner = accrual.partner;
                    if (
                        line.accountId === partner.accountPayableId ||
                        line.accountId === partner.accountEquityId
                    ) {
                        const currentAmount = partnerAmountMap.get(partner.id) || 0;
                        partnerAmountMap.set(partner.id, currentAmount + Number(line.credit));
                    }
                }
            }
        }

        // Update partner totalProfit and totalAmount with amounts from journal lines
        for (const [partnerId, amount] of partnerAmountMap) {
            await this.prisma.partner.update({
                where: { id: partnerId },
                data: {
                    totalProfit: { increment: amount },
                    upcomingProfit: { decrement: amount },
                    totalAmount: { increment: amount },
                },
            });
        }

        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount) throw new BadRequestException('حساب الادخار (20002) يجب ان يكون موجود');

        const Bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!Bank) throw new BadRequestException('bank is not existed');

        if (savingAmountInput && savingAmountInput > 0) {

            const totalPartnersProfit = accruals.reduce(
                (sum, a) => sum + Number(a.totalProfit),
                0,
            );

            if (totalPartnersProfit <= 0)
                throw new BadRequestException('إجمالي أرباح الشركاء غير صالح');

            for (const acc of accruals) {
                const partner = acc.partner;
                const totalProfit = Number(acc.totalProfit);

                const partnerEquity = await this.prisma.account.findUnique({ where: { id: partner.accountEquityId } });
                if (!partnerEquity) throw new BadRequestException('لا يوجد حساب رأس مال');

                const partnerSaving = await this.prisma.account.findUnique({ where: { id: partner.accountSavingId } });
                if (!partnerSaving) throw new BadRequestException('لا يوجد حساب ادخار');

                const partnerRatio = totalProfit / totalPartnersProfit;

                let savingAmount = savingAmountInput * partnerRatio;
                savingAmount = Math.round(savingAmount * 100) / 100;


                if ((partnerEquity.balance - partnerSaving.balance) < savingAmount) {
                    savingAmount = Math.round((partnerEquity.balance - partnerSaving.balance) * 100) / 100;
                }

                if (partnerEquity.balance > partnerSaving.balance && savingAmount > 0) {
                    const savingRecord = await this.prisma.partnerSavingAccrual.create({
                        data: {
                            partnerId: partner.id,
                            periodId: periodId,
                            accrualId: acc.id,
                            savingAmount: savingAmount,
                        },
                    });

                    const savingJournal = await this.journalService.createJournal(
                        {
                            reference: `SAVE-${partner.id}-${periodId}`,
                            description: `ادخار ثابت للشريك ${partner.name}`,
                            type: 'GENERAL',
                            sourceType: 'SAVING',
                            sourceId: savingRecord.id,
                            lines: [
                                {
                                    accountId: partner.accountSavingId,
                                    debit: 0,
                                    credit: savingAmount,
                                    description: `تسجيل ادخار (${savingAmount}) للشريك ${partner.name}`,
                                },
                                {
                                    accountId: partner.accountPayableId,
                                    debit: savingAmount,
                                    credit: 0,
                                    description: `خصم ادخار للشريك ${partner.name}`,
                                },
                                {
                                    accountId: Bank.id,
                                    debit: 0,
                                    credit: savingAmount,
                                    description: `خصم ادخار للشريك ${partner.name}`,
                                },
                                {
                                    accountId: savingAccount.id,
                                    debit: savingAmount,
                                    credit: 0,
                                    description: `خصم ادخار للشريك ${partner.name}`,
                                },
                            ],
                        },
                        userId,
                    );
                    await this.journalService.postJournal(savingJournal.journal.id, userId);

                    // Decrease partner totalProfit and totalAmount by the saving amount
                    await this.prisma.partner.update({
                        where: { id: partner.id },
                        data: {
                            totalProfit: { decrement: savingAmount },
                            totalAmount: { decrement: savingAmount },
                        },
                    });
                }
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

        return { message: 'تم توزيع الارباح بنجاح', closingJournalId };
    }

    // Reverse the posted closing journal
    async reverseClosing(periodId: number, userId: number) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Period not found');

        if (period.isClosed === false) throw new BadRequestException('الفترة غير مغلقة');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        const closingJournalId = period.closingJournalId || 0;

        // Get partner accruals to reverse amounts from closing journal
        const accruals = await this.prisma.partnerPeriodProfit.findMany({
            where: { periodId: periodId },
            include: { partner: true },
        });

        // Fetch closing journal with lines to reverse partner totals
        const closingJournal = await this.prisma.journalHeader.findUnique({
            where: { id: closingJournalId },
            include: {
                lines: {
                    include: { account: true },
                },
            },
        });

        // Build a map of partner ID to total credit amounts from closing journal lines
        const partnerAmountMap = new Map<number, number>();
        if (closingJournal && closingJournal.lines.length > 0) {
            for (const line of closingJournal.lines) {
                for (const accrual of accruals) {
                    const partner = accrual.partner;
                    if (
                        line.accountId === partner.accountPayableId ||
                        line.accountId === partner.accountEquityId
                    ) {
                        const currentAmount = partnerAmountMap.get(partner.id) || 0;
                        partnerAmountMap.set(partner.id, currentAmount + Number(line.credit));
                    }
                }
            }
        }

        // Unpost closing journal
        await this.journalService.unpostJournal(userId, closingJournalId);

        // decrement partner totalProfit and totalAmount based on closing journal amounts
        for (const [partnerId, amount] of partnerAmountMap) {
            await this.prisma.partner.update({
                where: { id: partnerId },
                data: {
                    totalProfit: { decrement: amount },
                    upcomingProfit: { increment: amount },
                    totalAmount: { decrement: amount },
                },
            });
        }

        // Get saving accruals with their amounts
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

                // Increment partner totalProfit and totalAmount by the saving amount
                await this.prisma.partner.update({
                    where: { id: s.partnerId },
                    data: {
                        totalProfit: { increment: Number(s.savingAmount) },
                        totalAmount: { increment: Number(s.savingAmount) },
                    },
                });
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

        return { message: 'تم الغاء توزيع الارباح بنجاح', periodId };
    }

    async getClosedPeriods(periodId?: number) {
        // Build where condition
        const whereCondition: any = { isClosed: true };
        if (periodId) whereCondition.id = periodId;

        // Fetch closed periods
        const periods = await this.prisma.periodHeader.findMany({
            where: whereCondition,
            include: {
                PartnerPeriodProfit: { include: { partner: true } },
                journals: {
                    include: {
                        lines: {
                            include: { account: true }
                        }
                    }
                }
            },
            orderBy: { startDate: 'desc' }
        });

        if (periods.length === 0) return [];

        const shareAccruals = await this.prisma.partnerShareAccrual.findMany({
            where: {
                periodId: periodId ? periodId : { in: periods.map(p => p.id) },
                isClosed: true,
            },
        });

        const shareMap = new Map<number, Map<number, any>>();

        for (const a of shareAccruals) {
            if (a.periodId === null) continue;

            if (!shareMap.has(a.periodId)) {
                shareMap.set(a.periodId, new Map());
            }

            shareMap.get(a.periodId)!.set(a.partnerId, {
                rawShare: Number(a.rawShare),
                companyCut: Number(a.companyCut),
                finalProfit: Number(a.partnerFinal),
                cents: Number(a.cents || 0),
            });
        }

        // Fetch savings for all periods in one query
        const savings = await this.prisma.partnerSavingAccrual.findMany({
            where: {
                periodId: periodId ? periodId : { in: periods.map(p => p.id) }
            }
        });

        // Convert savings list to map: periodId -> partnerId -> savingAmount
        const savingMap = new Map<number, Map<number, number>>();
        savings.forEach(s => {
            if (!savingMap.has(s.periodId)) savingMap.set(s.periodId, new Map());
            savingMap.get(s.periodId)!.set(s.partnerId, Number(s.savingAmount));
        });

        return await Promise.all(periods.map(async p => {

            const distributionJournal = await this.prisma.journalHeader.findUnique({
                where: { id: p.closingJournalId || 0 },
                include: {
                    lines: {
                        include: { account: true }
                    }
                }
            }
            );

            // Calculate company profit from journal lines
            const companyProfit = (distributionJournal?.lines || [])
                .filter(l => l.account.accountBasicType === 'COMPANY_SHARES')
                .reduce((sum, l) => sum + Number(l.credit), 0);

            // Get saving map for this period
            const periodSavingMap = savingMap.get(p.id) || new Map<number, number>();

            const round = (v: number) => Math.round(v * 100) / 100;

            const partners = p.PartnerPeriodProfit.map(pp => {
                const savingAmount = round(periodSavingMap.get(pp.partnerId) ?? 0);

                const share = shareMap
                    .get(p.id)
                    ?.get(pp.partnerId);

                if (!share) {
                    throw new Error(`Missing share accrual for partner ${pp.partnerId} in period ${p.id}`);
                }

                // Get final profit from journal lines (credit amount on partner's accountPayableId)
                let finalProfitFromJournal = 0;
                if (distributionJournal?.lines) {
                    const partnerLine = distributionJournal.lines.find(
                        l => l.accountId === pp.partner.accountPayableId && l.credit > 0
                    );
                    if (partnerLine) {
                        finalProfitFromJournal = Number(partnerLine.credit);
                    }
                }

                // Use journal value if available, otherwise use accrual value
                const finalProfit = finalProfitFromJournal > 0 ? finalProfitFromJournal : round(share.finalProfit);

                return {
                    partnerId: pp.partnerId,
                    partnerName: pp.partner.name,
                    nationalId: pp.partner.nationalId,
                    phone: pp.partner.phone,

                    // orgProfitPercent: pp.partner.orgProfitPercent,
                    // rawShare: round(share.rawShare),
                    // companyCut: round(share.companyCut),
                    finalProfit,

                    savingAmount,
                    totalAfterSaving: round(finalProfit - savingAmount),
                };
            });

            return {
                periodId: p.id,
                name: p.name,
                startDate: p.startDate,
                startdateHijri: this.toHijri(p.startDate),
                endDate: p.endDate,
                enddateHijri: p.endDate ? this.toHijri(p.endDate) : null,

                closingJournalId: p.closingJournalId,
                isDistributed: distributionJournal?.status === 'POSTED',

                companyProfit,
                totalSaving: partners.reduce((sum, pr) => sum + pr.savingAmount, 0),
                totalAfterSaving: partners.reduce((sum, pr) => sum + pr.totalAfterSaving, 0),
                partners,

                // Full distribution journal details (if exist)
                distributionJournal: distributionJournal || null
            };
        }));
    }
}