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

            if (period.closingJournalId) {
                throw new BadRequestException('Period is already closed');
            }

            const user = await this.prisma.user.findUnique({
                where: { id: closingUserId },
            });

            const drafts = await tx.journalHeader.findMany({
                where: { periodId, status: { not: 'POSTED' } },
            });
            if (drafts.length > 0) {
                throw new BadRequestException(`Cannot close period: there are ${drafts.length} unposted/draft journals.`);
            }

            // Partner profit accrual closing
            const accruals = await tx.partnerShareAccrual.findMany({
                where: { periodId: periodId },
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
                data: {
                    closingJournalId,
                    isClosed: true,
                    endDate: new Date(),
                },
            });

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: closingUserId,
                    screen: 'Period',
                    action: 'UPDATE',
                    description: `قام المستخدم ${user?.name} بإغلاق الفترة ${period.name} (${period.id})`,
                },
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

    async reversePeriodClosing(periodId: number, userId: number) {
        return await this.prisma.$transaction(async (tx) => {
            const period = await tx.periodHeader.findUnique({
                where: { id: periodId },
            });
            if (!period) throw new NotFoundException("Period not found");

            if (period.isClosed === false) {
                throw new BadRequestException("Period is not closed, cannot reverse.");
            }
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            // reverse last closed period first
            if (periodId !== (await tx.periodHeader.findFirst({
                where: { isClosed: true },
                orderBy: { startDate: 'desc' },
            }))?.id) {
                throw new BadRequestException("Only the most recently closed period can be reversed.");
            }

            const closingJournalId = period.closingJournalId || 0;

            await tx.accountsClosing.deleteMany({
                where: { periodId },
            });

            await tx.clientsClosing.deleteMany({
                where: { periodId },
            });

            await tx.partnerShareAccrual.updateMany({
                where: {
                    periodId: periodId,
                },
                data: {
                    isClosed: false,
                    isDistributed: false,
                },
            });

            await tx.partnerPeriodProfit.deleteMany({
                where: { periodId },
            });

            if (closingJournalId !== 0) {
                await tx.journalLine.deleteMany({
                    where: { journal: { id: closingJournalId } },
                });

                await tx.journalHeader.delete({
                    where: { id: closingJournalId },
                });
            }

            const newPeriod = await tx.periodHeader.findFirst({
                where: { startDate: { gt: period.startDate } },
                orderBy: { startDate: "asc" },
            });

            if (newPeriod) {
                await tx.periodHeader.delete({
                    where: { id: newPeriod.id },
                });
            }

            await tx.periodHeader.update({
                where: { id: periodId },
                data: { closingJournalId: null, isClosed: false, endDate: null },
            });

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: userId,
                    screen: 'Period',
                    action: 'UPDATE',
                    description: `قام المستخدم ${user?.name} بعكس إغلاق الفترة ${period.name} (${period.id})`,
                },
            });

            return {
                message: "Period closing reversed successfully.",
                periodId,
                deletedNewPeriodId: newPeriod?.id || null,
            };
        });
    }

    async getPeriodDetails(periodId: number) {
        const period = await this.prisma.periodHeader.findUnique({
            where: { id: periodId },
            include: {
                journals: {
                    include: {
                        lines: {
                            include: {
                                account: {
                                    select: {
                                        id: true,
                                        name: true,
                                        code: true,
                                        accountBasicType: true,
                                    }
                                },
                                client: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                }
                            }
                        },
                        postedBy: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    },
                    orderBy: {
                        date: 'desc'
                    }
                },
                PartnerPeriodProfit: {
                    include: {
                        partner: {
                            select: {
                                id: true,
                                name: true,
                                nationalId: true,
                                phone: true,
                                orgProfitPercent: true,
                                accountPayableId: true
                            }
                        }
                    }
                }
            }
        });

        if (!period) {
            throw new NotFoundException('Period not found');
        }

        // --- NEW: Get savings for this period ---
        const savings = await this.prisma.partnerSavingAccrual.findMany({
            where: { periodId },
            select: {
                partnerId: true,
                savingAmount: true
            }
        });

        const savingMap = new Map<number, number>();
        savings.forEach(s => savingMap.set(s.partnerId, Number(s.savingAmount)));

        // Calculate journal totals and transform data
        const journals = period.journals.map(journal => {
            const totalDebit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
            const totalCredit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);

            return {
                id: journal.id,
                reference: journal.reference,
                description: journal.description,
                date: journal.date,
                type: journal.type,
                status: journal.status,
                sourceType: journal.sourceType,
                totalDebit,
                totalCredit,
                lines: journal.lines.map(line => ({
                    id: line.id,
                    accountId: line.accountId,
                    accountName: line.account.name,
                    debit: Number(line.debit),
                    credit: Number(line.credit),
                    description: line.description,
                    clientId: line.clientId,
                    clientName: line.client?.name
                }))
            };
        });

        let partnerProfits = [] as any[];
        let totalPartnerProfit = 0;
        let companyProfit = 0;

        if (period.closingJournalId) {
            // For closed periods, use PartnerPeriodProfit data
            partnerProfits = period.PartnerPeriodProfit.map(ppp => ({
                partnerId: ppp.partnerId,
                partnerName: ppp.partner.name,
                partnerNationalId: ppp.partner.nationalId,
                partnerPhone: ppp.partner.phone,
                orgProfitPercent: ppp.partner.orgProfitPercent,
                totalProfit: Number(ppp.totalProfit),
                accountPayableId: ppp.partner.accountPayableId
            }));

            partnerProfits = partnerProfits.map(p => {
                const savingAmount = savingMap.get(p.partnerId) ?? 0;

                return {
                    ...p,
                    savingAmount,
                    totalAfterSaving: Math.round((p.totalProfit - savingAmount) * 100) / 100
                };
            });

            totalPartnerProfit = partnerProfits.reduce(
                (sum, partner) => sum + (partner.totalAfterSaving ?? partner.totalProfit),
                0
            );

            // Calculate company profit from closing journal
            const closingJournal = period.journals.find(j => j.id === period.closingJournalId);
            if (closingJournal) {
                const companyShareLines = closingJournal.lines.filter(line =>
                    line.account.accountBasicType === 'COMPANY_SHARES'
                );
                companyProfit = companyShareLines.reduce((sum, line) => sum + Number(line.credit), 0);
            }
        } else {
            // For open periods, calculate from journals and accruals
            const profitCalculation = await this.calculateOpenPeriodProfits(periodId);
            partnerProfits = profitCalculation.partnerProfits;
            totalPartnerProfit = profitCalculation.totalPartnerProfit;
            companyProfit = profitCalculation.companyProfit;
        }

        return {
            id: period.id,
            name: period.name,
            startDate: period.startDate,
            endDate: period.endDate,
            journals,
            partnerProfits,
            companyProfit,
            totalPartnerProfit,
            isClosed: !!period.closingJournalId
        };
    }

    private async calculateOpenPeriodProfits(periodId: number): Promise<{
        partnerProfits: Array<{
            partnerId: number;
            partnerName: string;
            totalProfit: number;
            accountPayableId: number;
        }>;
        totalPartnerProfit: number;
        companyProfit: number;
    }> {
        // Get all unclosed accruals (regardless of period)
        const allAccruals = await this.prisma.partnerShareAccrual.findMany({
            where: {
                periodId: periodId
            },
            include: {
                partner: {
                    select: {
                        id: true,
                        name: true,
                        accountPayableId: true
                    }
                }
            }
        });

        const partnerProfits: Array<{
            partnerId: number;
            partnerName: string;
            totalProfit: number;
            accountPayableId: number;
        }> = [];

        let totalPartnerProfit = 0;
        let companyProfit = 0;

        if (allAccruals.length > 0) {
            const profitByPartner = new Map<number, {
                partnerId: number;
                partnerName: string;
                totalProfit: number;
                accountPayableId: number;
            }>();

            for (const accrual of allAccruals) {
                const partnerId = accrual.partnerId;
                const current = profitByPartner.get(partnerId) || {
                    partnerId: accrual.partner.id,
                    partnerName: accrual.partner.name,
                    totalProfit: 0,
                    accountPayableId: accrual.partner.accountPayableId
                };

                current.totalProfit += Number(accrual.partnerFinal || 0);
                profitByPartner.set(partnerId, current);

                companyProfit += Number(accrual.companyCut || 0);
            }

            partnerProfits.push(...Array.from(profitByPartner.values()));
            totalPartnerProfit = partnerProfits.reduce((sum, partner) => sum + partner.totalProfit, 0);
        }

        return {
            partnerProfits,
            totalPartnerProfit,
            companyProfit
        };
    }

    async getAllPeriods(
        page = 1,
        filters?: {
            limit?: number;
            name?: string;
            startDate?: string;
            endDate?: string;
            isClosed?: boolean;
        }
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = {};

        // SEARCH BY NAME
        if (filters?.name) {
            where.name = { contains: filters.name, mode: 'insensitive' };
        }

        // FILTER BY START DATE
        if (filters?.startDate) {
            where.startDate = { gte: new Date(filters.startDate) };
        }

        // FILTER BY END DATE
        if (filters?.endDate) {
            where.endDate = {
                lte: new Date(filters.endDate + "T23:59:59"),
            };
        }

        // FILTER BY CLOSED STATUS
        if (filters?.isClosed !== undefined) {
            where.isClosed = filters.isClosed;
        }

        where.journals = {
            some: {}
        };

        // COUNT TOTAL RECORDS
        const totalPeriods = await this.prisma.periodHeader.count({ where });
        const totalPages = Math.ceil(totalPeriods / limit);

        if (page > totalPages && totalPeriods > 0) {
            throw new NotFoundException("Page not found");
        }

        // FETCH PERIOD DATA
        const periods = await this.prisma.periodHeader.findMany({
            where,
            skip,
            take: limit,
            orderBy: { startDate: "desc" },
        });

        return {
            totalPeriods,
            totalPages,
            currentPage: page,
            periods,
        };
    }
}