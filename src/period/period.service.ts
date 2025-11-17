import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType } from '@prisma/client';

type JournalLineDto = {
    accountId: number;
    debit: number;
    credit: number;
    description: string;
};

@Injectable()
export class PeriodService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    async closePeriod(periodId: number, closingUserId: number) {
        return await this.prisma.$transaction(async (tx) => {
            const period = await tx.periodHeader.findUnique({ where: { id: periodId } });
            if (!period) throw new NotFoundException('Period not found');

            const drafts = await tx.journalHeader.findMany({
                where: { periodId, status: { not: 'POSTED' } },
            });
            if (drafts.length > 0) {
                throw new BadRequestException(`Cannot close period: there are ${drafts.length} unposted/draft journals.`);
            }

            // Partner profit accrual closing
            const accruals = await tx.partnerShareAccrual.findMany({
                where: { isClosed: false },
                include: { partner: true },
            });

            const accrualsByPartner = new Map<number, { partnerFinal: number; partnerAccountId: number }>();
            let totalCompanyShare = 0;

            for (const a of accruals) {
                const partnerId = a.partnerId;
                const accountId = a.partner.accountPayableId;

                const entry = accrualsByPartner.get(partnerId) ?? { partnerFinal: 0, partnerAccountId: accountId };
                entry.partnerFinal += Number(a.partnerFinal || 0);
                accrualsByPartner.set(partnerId, entry);

                totalCompanyShare += Number(a.companyCut || 0);
            }

            const LOAN_INCOME = await tx.account.findFirst({ where: { accountBasicType: 'LOAN_INCOME' } });
            const COMPANY_SHARES = await tx.account.findFirst({ where: { accountBasicType: 'COMPANY_SHARES' } });

            if (!LOAN_INCOME) throw new BadRequestException('LOAN_INCOME account is missing');
            if (!COMPANY_SHARES) throw new BadRequestException('COMPANY_SHARES account is missing');

            const lines: JournalLineDto[] = [];

            for (const [, v] of accrualsByPartner) {
                lines.push({
                    accountId: LOAN_INCOME.id,
                    debit: Number(v.partnerFinal.toFixed(2)),
                    credit: 0,
                    description: 'Partner shares for period',
                });
                lines.push({
                    accountId: v.partnerAccountId,
                    debit: 0,
                    credit: Number(v.partnerFinal.toFixed(2)),
                    description: 'Partner payable - share for period',
                });
            }

            if (totalCompanyShare > 0) {
                lines.push({
                    accountId: LOAN_INCOME.id,
                    debit: Number(totalCompanyShare.toFixed(2)),
                    credit: 0,
                    description: 'Partner shares for period',
                });
                lines.push({
                    accountId: COMPANY_SHARES.id,
                    debit: 0,
                    credit: Number(totalCompanyShare.toFixed(2)),
                    description: 'Company share from partners profit',
                });
            }

            let closingJournalId: number | null = null;
            if (lines.length > 0) {
                const created = await this.journalService.createJournal(
                    {
                        periodId: period.id,
                        reference: `CLOSE-PERIOD-${period.id}-${Date.now()}`,
                        description: `Closing partner profit for period ${period.id}`,
                        type: 'CLOSING',
                        sourceType: JournalSourceType.PERIOD_CLOSING,
                        sourceId: period.id,
                        lines,
                    },
                    closingUserId,
                );
                closingJournalId = created?.journal?.id ?? null;
            }

            // Mark accruals as closed
            for (const a of accruals) {
                await tx.partnerShareAccrual.update({
                    where: { id: a.id },
                    data: { isClosed: true },
                });
            }

            // Save partner period summary
            for (const [partnerId, sums] of accrualsByPartner.entries()) {
                await tx.partnerPeriodProfit.create({
                    data: {
                        partnerId,
                        periodId: period.id,
                        totalProfit: Number(sums.partnerFinal.toFixed(2)),
                    },
                });
            }

            // post the journal
            if (closingJournalId) {
                await this.journalService.postJournal(closingJournalId, closingUserId);
            }

            // Accounts closing
            await this.closeAccountsWithParents(tx, periodId);

            // Clients closing
            const clients = await tx.client.findMany({});
            for (const c of clients) {
                const sums = await tx.journalLine.aggregate({
                    where: { clientId: c.id, journal: { periodId } },
                    _sum: { debit: true, credit: true },
                });

                const periodDebit = Number(sums._sum.debit ?? 0);
                const periodCredit = Number(sums._sum.credit ?? 0);

                const prevClientClose = await tx.clientsClosing.findFirst({
                    where: { clientId: c.id },
                    orderBy: { periodId: 'desc' },
                });

                const openingBalance = prevClientClose ? prevClientClose.closingBalance : c.balance ?? 0;

                const closingBalance = parseFloat((openingBalance + periodDebit - periodCredit).toFixed(2));

                await tx.clientsClosing.create({
                    data: {
                        clientId: c.id,
                        periodId,
                        openingDebit: prevClientClose?.closingDebit ?? 0,
                        openingCredit: prevClientClose?.closingCredit ?? 0,
                        openingBalance,
                        closingDebit: (prevClientClose?.closingDebit ?? 0) + periodDebit,
                        closingCredit: (prevClientClose?.closingCredit ?? 0) + periodCredit,
                        closingBalance,
                        lastUpdated: new Date(),
                    },
                });
            }

            // Create new period WITHOUT Opening Journal
            const newPeriod = await tx.periodHeader.create({
                data: {
                    name: `Open period starting ${new Date().toISOString().slice(0, 10)}`,
                    startDate: new Date(),
                },
            });

            await tx.periodHeader.update({
                where: { id: period.id },
                data: { closingJournalId },
            });

            return {
                message: 'Period closed successfully (no opening journal)',
                periodId: period.id,
                newPeriodId: newPeriod.id,
            };
        });
    }

    private async closeAccountsWithParents(tx: any, periodId: number) {
        // جلب كل الحسابات
        const accounts = await tx.account.findMany({
            select: { id: true, parentId: true, nature: true },
        });

        // جلب مجموعات الحركات لكل حساب
        const periodLines = new Map<number, { debit: number; credit: number }>();
        for (const acc of accounts) {
            const sums = await tx.journalLine.aggregate({
                where: { accountId: acc.id, journal: { periodId } },
                _sum: { debit: true, credit: true },
            });
            periodLines.set(acc.id, {
                debit: Number(sums._sum.debit ?? 0),
                credit: Number(sums._sum.credit ?? 0),
            });
        }

        // جلب اخر اغلاق لكل حساب
        const prevClosings = new Map<number, { closingDebit: number; closingCredit: number; closingBalance: number }>();
        for (const acc of accounts) {
            const prev = await tx.accountsClosing.findFirst({
                where: { accountId: acc.id },
                orderBy: { periodId: 'desc' },
            });
            prevClosings.set(acc.id, {
                closingDebit: Number(prev?.closingDebit ?? 0),
                closingCredit: Number(prev?.closingCredit ?? 0),
                closingBalance: Number(prev?.closingBalance ?? 0),
            });
        }

        // بناء خريطة الأبناء
        const childrenMap = new Map<number, number[]>();
        for (const acc of accounts) {
            if (acc.parentId) {
                if (!childrenMap.has(acc.parentId)) childrenMap.set(acc.parentId, []);
                childrenMap.get(acc.parentId)!.push(acc.id);
            }
        }

        // recursive حساب كل حساب ودمج الأبناء
        const computed = new Map<number, { debit: number; credit: number; openingBalance: number; closingBalance: number }>();
        const compute = async (accountId: number): Promise<{ debit: number; credit: number; openingBalance: number; closingBalance: number }> => {
            if (computed.has(accountId)) return computed.get(accountId)!;

            const acc = accounts.find(a => a.id === accountId)!;
            const own = periodLines.get(accountId) ?? { debit: 0, credit: 0 };
            let totalDebit = own.debit;
            let totalCredit = own.credit;

            // دمج الأبناء
            const children = childrenMap.get(accountId) ?? [];
            for (const childId of children) {
                const childTotals = await compute(childId);
                totalDebit += childTotals.debit;
                totalCredit += childTotals.credit;
            }

            // فتح الرصيد
            const prev = prevClosings.get(accountId);
            const openingBalance = prev?.closingBalance ?? 0;

            // حساب الرصيد الختامي
            let closingBalance: number;
            if (acc.nature === 'DEBIT') {
                closingBalance = openingBalance + totalDebit - totalCredit;
            } else {
                closingBalance = openingBalance + totalCredit - totalDebit;
            }
            closingBalance = parseFloat(closingBalance.toFixed(2));

            // حفظ الناتج
            computed.set(accountId, { debit: totalDebit, credit: totalCredit, openingBalance, closingBalance });

            // تخزين في accountsClosing
            await tx.accountsClosing.create({
                data: {
                    accountId: acc.id,
                    periodId,
                    openingDebit: prev?.closingDebit ?? 0,
                    openingCredit: prev?.closingCredit ?? 0,
                    openingBalance,
                    closingDebit: (prev?.closingDebit ?? 0) + totalDebit,
                    closingCredit: (prev?.closingCredit ?? 0) + totalCredit,
                    closingBalance,
                    lastUpdated: new Date(),
                },
            });

            return computed.get(accountId)!;
        };

        // تنفيذ الحساب لكل حساب (يغطي الأبناء أيضاً)
        for (const acc of accounts) {
            await compute(acc.id);
        }
    }
}