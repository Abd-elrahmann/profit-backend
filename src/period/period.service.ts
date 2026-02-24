import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType } from '@prisma/client';
import moment from "moment-hijri";

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

    private toHijri(date?: Date | null) {
        if (!date) return null;
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }

    async closePeriod(periodId: number, closingUserId: number) {
        return await this.prisma.$transaction(async (tx) => {

            const period = await tx.periodHeader.findUnique({ where: { id: periodId } });
            if (!period) throw new NotFoundException('Period not found');
            if (period.isClosed) throw new BadRequestException('الفترة مغلقة بالفعل');

            const drafts = await tx.journalHeader.findMany({
                where: { periodId, status: { not: 'POSTED' } },
            });
            if (drafts.length > 0) {
                throw new BadRequestException(`هناك ${drafts.length} قيود غير معتمدة`);
            }

            const accruals = await tx.partnerShareAccrual.findMany({
                where: { periodId, isClosed: false, isDistributed: false },
                include: { partner: true },
            });

            if (accruals.length === 0) {
                throw new BadRequestException('لا توجد أرباح لإغلاق الفترة');
            }

            const expenses = await tx.journalLine.aggregate({
                where: {
                    journal: { periodId },
                    account: { accountBasicType: 'EXPENSES' }
                },
                _sum: { debit: true }
            });

            const totalExpenses = Number(expenses._sum.debit ?? 0);

            const partnerGrossMap = new Map<number, number>();
            let totalGrossPartnerProfit = 0;
            let totalGrossCompanyProfit = 0;
            let totalOldCents = 0;

            for (const a of accruals) {
                const pf = Number(a.partnerFinal || 0);
                const cc = Number(a.companyCut || 0);
                const cents = Number(a.cents || 0);

                partnerGrossMap.set(
                    a.partnerId,
                    (partnerGrossMap.get(a.partnerId) || 0) + pf
                );

                totalGrossPartnerProfit += pf;
                totalGrossCompanyProfit += cc;
                totalOldCents += cents;
            }

            const totalGrossProfit =
                totalGrossPartnerProfit + totalGrossCompanyProfit + totalOldCents;

            const partnersExpenseShare =
                totalExpenses * (totalGrossPartnerProfit / totalGrossProfit);

            const companyExpenseShare =
                totalExpenses * (totalGrossCompanyProfit / totalGrossProfit);

            let centsFromPartners = 0;
            const partnerMap = new Map<number, {
                partnerId: number;
                accountPayableId: number;
                netProfit: number;
            }>();

            for (const [partnerId, gross] of partnerGrossMap.entries()) {
                const expense = totalExpenses * (gross / totalGrossProfit);
                const netUnrounded = gross - expense;

                const netRounded = Math.floor(netUnrounded);
                const cents = netUnrounded - netRounded;

                centsFromPartners += cents;

                const partner = accruals.find(a => a.partnerId === partnerId)!.partner;
                partnerMap.set(partnerId, {
                    partnerId,
                    accountPayableId: partner.accountPayableId,
                    netProfit: netRounded,
                });
            }

            centsFromPartners = Number(centsFromPartners.toFixed(2));

            const companyNet =
                totalGrossCompanyProfit - companyExpenseShare;

            const adjustedOldCents =
                totalOldCents * (companyNet / totalGrossCompanyProfit);

            const companyRoundingCents = companyNet - Math.floor(companyNet * 100) / 100;
            const totalCentsCollected = Number(
                (centsFromPartners + adjustedOldCents + companyRoundingCents).toFixed(2)
            );

            const finalCompanyProfit = Number(
                (Math.floor(companyNet * 100) / 100 + totalCentsCollected).toFixed(2)
            );

            const LOAN_INCOME = await tx.account.findFirstOrThrow({
                where: { accountBasicType: 'LOAN_INCOME' },
            });

            const COMPANY_SHARES = await tx.account.findFirstOrThrow({
                where: { accountBasicType: 'COMPANY_SHARES' },
            });

            const lines: JournalLineDto[] = [];


            for (const p of partnerMap.values()) {
                const amount = Number(p.netProfit.toFixed(2));

                lines.push({
                    accountId: LOAN_INCOME.id,
                    debit: amount,
                    credit: 0,
                    description: 'نصيب المساهمين للفترة',
                });

                lines.push({
                    accountId: p.accountPayableId,
                    debit: 0,
                    credit: amount,
                    description: 'نصيب المساهم من أرباح الفترة',
                });
            }

            lines.push({
                accountId: LOAN_INCOME.id,
                debit: finalCompanyProfit,
                credit: 0,
                description: 'نصيب الشركة من أرباح الفترة',
            });

            lines.push({
                accountId: COMPANY_SHARES.id,
                debit: 0,
                credit: finalCompanyProfit,
                description: 'نصيب الشركة من أرباح الفترة',
            });

            const closingJournal = await this.journalService.createJournal({
                periodId: period.id,
                reference: `CLOSE-${period.id}-${Date.now()}`,
                description: `إقفال الفترة ${period.name}`,
                type: 'CLOSING',
                sourceType: JournalSourceType.PERIOD_CLOSING,
                sourceId: period.id,
                lines,
            }, closingUserId);


            await tx.partnerShareAccrual.updateMany({
                where: { periodId },
                data: { isClosed: true },
            });


            for (const p of partnerMap.values()) {
                await tx.partnerPeriodProfit.create({
                    data: {
                        partnerId: p.partnerId,
                        periodId: period.id,
                        totalProfit: Number(p.netProfit.toFixed(2)),
                    },
                });
            }


            await this.closeAccountsWithParents(tx, periodId);


            await tx.periodHeader.update({
                where: { id: periodId },
                data: {
                    isClosed: true,
                    closingJournalId: closingJournal.journal.id,
                    endDate: new Date(),
                },
            });


            const newPeriod = await tx.periodHeader.create({
                data: {
                    name: `فترة مفتوحة تبدأ من ${new Date().toISOString().slice(0, 10)}`,
                    startDate: new Date(),
                },
            });

            return {
                message: 'تم إغلاق الفترة بنجاح',
                periodId: period.id,
                newPeriodId: newPeriod.id,
            };
        });
    }

    private async closeAccountsWithParents(tx: any, periodId: number) {

        const accounts = await tx.account.findMany({
            select: { id: true, parentId: true, nature: true },
        });


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


        const childrenMap = new Map<number, number[]>();
        for (const acc of accounts) {
            if (acc.parentId) {
                if (!childrenMap.has(acc.parentId)) childrenMap.set(acc.parentId, []);
                childrenMap.get(acc.parentId)!.push(acc.id);
            }
        }


        const computed = new Map<number, { debit: number; credit: number; openingBalance: number; closingBalance: number }>();
        const compute = async (accountId: number): Promise<{ debit: number; credit: number; openingBalance: number; closingBalance: number }> => {
            if (computed.has(accountId)) return computed.get(accountId)!;

            const acc = accounts.find(a => a.id === accountId)!;
            const own = periodLines.get(accountId) ?? { debit: 0, credit: 0 };
            let totalDebit = own.debit;
            let totalCredit = own.credit;


            const children = childrenMap.get(accountId) ?? [];
            for (const childId of children) {
                const childTotals = await compute(childId);
                totalDebit += childTotals.debit;
                totalCredit += childTotals.credit;
            }


            const prev = prevClosings.get(accountId);
            const openingBalance = prev?.closingBalance ?? 0;


            let closingBalance: number;
            if (acc.nature === 'DEBIT') {
                closingBalance = openingBalance + totalDebit - totalCredit;
            } else {
                closingBalance = openingBalance + totalCredit - totalDebit;
            }
            closingBalance = parseFloat(closingBalance.toFixed(2));


            computed.set(accountId, { debit: totalDebit, credit: totalCredit, openingBalance, closingBalance });


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
                throw new BadRequestException("الفترة مفتوحة بالفعل.");
            }
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });


            if (periodId !== (await tx.periodHeader.findFirst({
                where: { isClosed: true },
                orderBy: { startDate: 'desc' },
            }))?.id) {
                throw new BadRequestException("يجب عكس إغلاق الفترة المغلقة الأخيرة أولاً.");
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

            await tx.partnerSavingAccrual.deleteMany({
                where: { periodId },
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


            await this.prisma.auditLog.create({
                data: {
                    userId: userId,
                    screen: 'Period',
                    action: 'UPDATE',
                    description: `قام المستخدم ${user?.name} بعكس إغلاق الفترة ${period.name} (${period.id})`,
                },
            });

            return {
                message: "تم عكس إغلاق الفترة بنجاح.",
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
                                    select: { id: true, name: true }
                                }
                            }
                        },
                        postedBy: { select: { id: true, name: true } }
                    },
                    orderBy: { date: 'desc' }
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

        if (!period) throw new NotFoundException('Period not found');


        const savings = await this.prisma.partnerSavingAccrual.findMany({
            where: { periodId },
            select: { partnerId: true, savingAmount: true }
        });

        const savingMap = new Map<number, number>();
        savings.forEach(s => savingMap.set(s.partnerId, Number(s.savingAmount)));


        const journals = period.journals.map(journal => {
            const totalDebit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
            const totalCredit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);

            return {
                id: journal.id,
                reference: journal.reference,
                description: journal.description,
                date: journal.date,
                dateHijri: this.toHijri(journal.date),
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


        const expenses = await this.prisma.journalLine.aggregate({
            where: {
                journal: { periodId },
                account: { accountBasicType: 'EXPENSES' }
            },
            _sum: { debit: true }
        });

        const totalExpenses = Number(expenses._sum.debit ?? 0);

        if (period.isClosed) {
            partnerProfits = period.PartnerPeriodProfit.map(ppp => ({
                partnerId: ppp.partnerId,
                partnerName: ppp.partner.name,
                partnerNationalId: ppp.partner.nationalId,
                partnerPhone: ppp.partner.phone,
                orgProfitPercent: ppp.partner.orgProfitPercent,
                totalProfit: Number(ppp.totalProfit),
                accountPayableId: ppp.partner.accountPayableId
            }));


            const accruals = await this.prisma.partnerShareAccrual.findMany({
                where: { periodId, isClosed: true }
            });

            const partnerGrossMap = new Map<number, number>();
            let totalGrossPartnerProfit = 0;
            let totalGrossCompanyProfit = 0;
            let totalOldCents = 0;

            for (const accrual of accruals) {
                const pf = Number(accrual.partnerFinal || 0);
                const cc = Number(accrual.companyCut || 0);
                const cents = Number(accrual.cents || 0);

                partnerGrossMap.set(
                    accrual.partnerId,
                    (partnerGrossMap.get(accrual.partnerId) || 0) + pf
                );

                totalGrossPartnerProfit += pf;
                totalGrossCompanyProfit += cc;
                totalOldCents += cents;
            }

            const totalGrossProfit =
                totalGrossPartnerProfit + totalGrossCompanyProfit + totalOldCents;

            const partnersExpenseShare =
                totalExpenses * (totalGrossPartnerProfit / totalGrossProfit);

            const companyExpenseShare =
                totalExpenses * (totalGrossCompanyProfit / totalGrossProfit);

            let centsFromPartners = 0;

            const partnerMap = new Map<number, any>();

            for (const [partnerId, gross] of partnerGrossMap.entries()) {
                const expense = totalExpenses * (gross / totalGrossProfit);
                const netUnrounded = gross - expense;

                const netRounded = Math.floor(netUnrounded);
                const cents = netUnrounded - netRounded;

                centsFromPartners += cents;

                partnerMap.set(partnerId, {
                    grossProfit: Number(gross.toFixed(2)),
                    expenseShare: Number(expense.toFixed(2)),
                    netProfit: Number(netRounded.toFixed(2)),
                });
            }

            centsFromPartners = Number(centsFromPartners.toFixed(2));

            const companyNet =
                totalGrossCompanyProfit - companyExpenseShare;

            const adjustedOldCents =
                totalOldCents * (companyNet / totalGrossCompanyProfit);

            const totalCentsCollected = Number(
                (centsFromPartners + adjustedOldCents).toFixed(2)
            );

            const finalCompanyProfit = Number(
                (companyNet).toFixed(2)
            );

            partnerProfits = Array.from(partnerMap.entries()).map(([pid, data]) => {
                const orig = partnerProfits.find(p => p.partnerId === pid);
                return {
                    partnerId: pid,
                    partnerName: orig!.partnerName,
                    partnerNationalId: orig!.partnerNationalId,
                    partnerPhone: orig!.partnerPhone,
                    orgProfitPercent: orig!.orgProfitPercent,
                    accountPayableId: orig!.accountPayableId,
                    grossProfit: data.grossProfit,
                    expenseShare: data.expenseShare,
                    netProfit: data.netProfit,
                };
            });

            const finalPartnerProfit = partnerProfits.reduce(
                (s, p) => s + p.netProfit,
                0
            );

            const totalPeriodDebit = journals.reduce((sum, j) => sum + j.totalDebit, 0);
            const totalPeriodCredit = journals.reduce((sum, j) => sum + j.totalCredit, 0);
            const totalPeriodBalance = totalPeriodDebit - totalPeriodCredit;

            return {
                id: period.id,
                name: period.name,
                startDate: period.startDate,
                startDateHijri: this.toHijri(period.startDate),
                endDate: period.endDate,
                endDateHijri: this.toHijri(period.endDate),
                totalDebit: totalPeriodDebit,
                totalCredit: totalPeriodCredit,
                totalBalance: totalPeriodBalance,
                totalExpenses: Number(totalExpenses.toFixed(2)),
                grossProfit: {
                    partnerTotal: Number(totalGrossPartnerProfit.toFixed(2)),
                    companyTotal: Number(totalGrossCompanyProfit.toFixed(2)),
                    totalCents: Number(totalOldCents.toFixed(2)),
                    total: Number(
                        (totalGrossPartnerProfit + totalGrossCompanyProfit + totalOldCents).toFixed(2)
                    ),
                },
                expenseDistribution: {
                    totalExpenses: Number(totalExpenses.toFixed(2)),
                    partnersShare: Number(partnersExpenseShare.toFixed(2)),
                    companyShare: Number(companyExpenseShare.toFixed(2)),
                },
                centCollectionBreakdown: {
                    centsFromPartnerRounding: Number(centsFromPartners.toFixed(2)),
                    adjustedCentsFromAccrual: Number(adjustedOldCents.toFixed(2)),
                    totalCentsCollected: Number(totalCentsCollected.toFixed(2)),
                },
                PartnerDetails: {
                    partnersShare: Number(partnersExpenseShare.toFixed(2)),
                    netProfit: Number(
                        (totalGrossPartnerProfit - partnersExpenseShare).toFixed(2)
                    ),
                },
                companyDetails: {
                    Profit: Number(totalGrossCompanyProfit.toFixed(2)),
                    expenseShare: Number(companyExpenseShare.toFixed(2)),
                    netProfit: Number(
                        (totalGrossCompanyProfit - companyExpenseShare).toFixed(2)
                    ),
                    centCollected: Number(totalCentsCollected.toFixed(2)),
                },
                journals,
                partnerProfits,
                centCollected: Number(totalCentsCollected.toFixed(2)),
                companyProfit: finalCompanyProfit,
                totalPartnerProfit: finalPartnerProfit,
                totalProfit: Number(
                    (finalPartnerProfit + finalCompanyProfit + totalCentsCollected).toFixed(2)
                ),
                isClosed: period.isClosed
            };
        } else {
            const accruals = await this.prisma.partnerShareAccrual.findMany({
                where: { periodId, isClosed: false, isDistributed: false },
                include: { partner: true }
            });

            const partnerGrossMap = new Map<number, number>();
            let totalGrossPartnerProfit = 0;
            let totalGrossCompanyProfit = 0;
            let totalOldCents = 0;

            for (const a of accruals) {
                const pf = Number(a.partnerFinal || 0);
                const cc = Number(a.companyCut || 0);
                const cents = Number(a.cents || 0);

                partnerGrossMap.set(
                    a.partnerId,
                    (partnerGrossMap.get(a.partnerId) || 0) + pf
                );

                totalGrossPartnerProfit += pf;
                totalGrossCompanyProfit += cc;
                totalOldCents += cents;
            }

            const totalGrossProfit =
                totalGrossPartnerProfit + totalGrossCompanyProfit + totalOldCents;

            const partnersExpenseShare =
                totalExpenses * (totalGrossPartnerProfit / totalGrossProfit);

            const companyExpenseShare =
                totalExpenses * (totalGrossCompanyProfit / totalGrossProfit);

            let centsFromPartners = 0;

            const partnerMap = new Map<number, any>();

            for (const [partnerId, gross] of partnerGrossMap.entries()) {
                const expense = totalExpenses * (gross / totalGrossProfit);
                const netUnrounded = gross - expense;

                const netRounded = Math.floor(netUnrounded);
                const cents = netUnrounded - netRounded;

                centsFromPartners += cents;

                partnerMap.set(partnerId, {
                    grossProfit: Number(gross.toFixed(2)),
                    expenseShare: Number(expense.toFixed(2)),
                    netProfit: Number(netRounded.toFixed(2)),
                });
            }

            centsFromPartners = Number(centsFromPartners.toFixed(2));

            const companyNet =
                totalGrossCompanyProfit - companyExpenseShare;

            const adjustedOldCents =
                totalOldCents * (companyNet / totalGrossCompanyProfit);

            const totalCentsCollected = Number(
                (centsFromPartners + adjustedOldCents).toFixed(2)
            );

            const finalCompanyProfit = Number(
                (companyNet).toFixed(2)
            );

            partnerProfits = Array.from(partnerMap.entries()).map(([partnerId, data]) => {
                const partner = accruals.find(a => a.partnerId === partnerId)!.partner;
                return {
                    partnerId,
                    partnerName: partner.name,
                    accountPayableId: partner.accountPayableId,
                    grossProfit: data.grossProfit,
                    expenseShare: data.expenseShare,
                    netProfit: data.netProfit,
                };
            });

            const finalPartnerProfit = partnerProfits.reduce(
                (s, p) => s + p.netProfit,
                0
            );

            const totalPeriodDebit = journals.reduce((s, j) => s + j.totalDebit, 0);
            const totalPeriodCredit = journals.reduce((s, j) => s + j.totalCredit, 0);

            return {
                id: period.id,
                name: period.name,
                startDate: period.startDate,
                startDateHijri: this.toHijri(period.startDate),
                endDate: period.endDate,
                endDateHijri: this.toHijri(period.endDate),

                totalDebit: totalPeriodDebit,
                totalCredit: totalPeriodCredit,
                totalBalance: totalPeriodDebit - totalPeriodCredit,

                totalExpenses: Number(totalExpenses.toFixed(2)),

                grossProfit: {
                    partnerTotal: Number(totalGrossPartnerProfit.toFixed(2)),
                    companyTotal: Number(totalGrossCompanyProfit.toFixed(2)),
                    totalCents: Number(totalOldCents.toFixed(2)),
                    total: Number(
                        (totalGrossPartnerProfit + totalGrossCompanyProfit + totalOldCents).toFixed(2)
                    ),
                },

                expenseDistribution: {
                    totalExpenses: Number(totalExpenses.toFixed(2)),
                    partnersShare: Number(partnersExpenseShare.toFixed(2)),
                    companyShare: Number(companyExpenseShare.toFixed(2)),
                },

                centCollectionBreakdown: {
                    centsFromPartnerRounding: Number(centsFromPartners.toFixed(2)),
                    adjustedCentsFromAccrual: Number(adjustedOldCents.toFixed(2)),
                    totalCentsCollected: Number(totalCentsCollected.toFixed(2)),
                },

                PartnerDetails: {
                    partnersShare: Number(partnersExpenseShare.toFixed(2)),
                    netProfit: Number(
                        (totalGrossPartnerProfit - partnersExpenseShare).toFixed(2)
                    ),
                },

                companyDetails: {
                    Profit: Number(totalGrossCompanyProfit.toFixed(2)),
                    expenseShare: Number(companyExpenseShare.toFixed(2)),
                    netProfit: Number(
                        (totalGrossCompanyProfit - companyExpenseShare).toFixed(2)
                    ),
                    centCollected: Number(totalCentsCollected.toFixed(2)),
                },

                journals,
                partnerProfits,

                centCollected: Number(totalCentsCollected.toFixed(2)),
                companyProfit: finalCompanyProfit,
                totalPartnerProfit: finalPartnerProfit,
                totalProfit: Number(
                    (finalPartnerProfit + finalCompanyProfit + totalCentsCollected).toFixed(2)
                ),

                isClosed: period.isClosed,
            };
        }
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
        if (filters?.name) where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.startDate) where.startDate = { gte: new Date(filters.startDate) };
        if (filters?.endDate) where.endDate = { lte: new Date(filters.endDate + "T23:59:59") };
        if (filters?.isClosed !== undefined) {
            where.isClosed = typeof filters.isClosed === 'string' ? filters.isClosed === 'true' : Boolean(filters.isClosed);
        }

        const totalPeriods = await this.prisma.periodHeader.count({ where });
        const totalPages = Math.ceil(totalPeriods / limit);
        if (page > totalPages && totalPeriods > 0) throw new NotFoundException("Page not found");

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
            periods: periods.map(p => ({
                ...p,
                startDateHijri: this.toHijri(p.startDate),
                endDateHijri: this.toHijri(p.endDate),
            })),
        };
    }

    async comparePeriods(periodId1: number, periodId2: number) {

        const getPeriodData = async (periodId: number) => {
            const period = await this.prisma.periodHeader.findUnique({
                where: { id: periodId },
                include: { journals: { include: { lines: true } } },
            });

            if (!period) throw new NotFoundException("الفترة غير موجودة");

            let netProfit = 0;

            if (period.isClosed) {
                const profitAccruals = await this.prisma.partnerPeriodProfit.findMany({
                    where: { periodId },
                });

                netProfit = profitAccruals.reduce(
                    (sum, p) => sum + Number(p.totalProfit || 0),
                    0
                );

                const companyShareLines = await this.prisma.journalLine.findMany({
                    where: {
                        journal: { periodId, type: 'CLOSING' },
                        account: { accountBasicType: 'COMPANY_SHARES' }
                    }
                });

                const companyProfit = companyShareLines.reduce(
                    (sum, line) => sum + Number(line.credit || 0),
                    0
                );

                netProfit += companyProfit;

            } else {
                const accruals = await this.prisma.partnerShareAccrual.findMany({
                    where: { periodId }
                });

                netProfit = accruals.reduce(
                    (sum, a) =>
                        sum +
                        Number(a.partnerFinal || 0) +
                        Number(a.companyCut || 0),
                    0
                );
            }

            const delinquentRepayments = await this.prisma.repayment.findMany({
                where: {
                    remaining: { gt: 0 },
                    dueDate: {
                        gte: period.startDate,
                        lte: period.endDate || new Date(),
                    },
                    loan: {
                        status: { in: ["ACTIVE", "DEFAULTED"] },
                        client: { status: "متعثر" },
                    },
                },
                include: {
                    loan: {
                        include: {
                            LoanPartnerShare: true
                        }
                    }
                }
            });

            let delinquency = 0;

            for (const repayment of delinquentRepayments) {
                const remaining = Number(repayment.remaining || 0);

                for (const lps of repayment.loan.LoanPartnerShare) {
                    delinquency += remaining * (Number(lps.sharePercent || 0) / 100);
                }
            }

            delinquency = parseFloat(delinquency.toFixed(2));

            return {
                periodId,
                periodName: period.name,
                startDate: period.startDate,
                endDate: period.endDate || new Date(),
                isClosed: period.isClosed,
                netProfit: parseFloat(netProfit.toFixed(2)),
                delinquency
            };
        };

        const [period1Data, period2Data] = await Promise.all([
            getPeriodData(periodId1),
            getPeriodData(periodId2),
        ]);

        const netProfitChange = period2Data.netProfit - period1Data.netProfit;
        const delinquencyChange = period2Data.delinquency - period1Data.delinquency;
        const profitabilityImproved = netProfitChange > 0;
        const delinquencyImproved = delinquencyChange < 0;

        return {
            comparison: {
                period1: {
                    id: period1Data.periodId,
                    name: period1Data.periodName,
                    startDate: period1Data.startDate,
                    endDate: period1Data.endDate,
                    isClosed: period1Data.isClosed,
                    netProfit: period1Data.netProfit,
                    delinquency: period1Data.delinquency,
                },
                period2: {
                    id: period2Data.periodId,
                    name: period2Data.periodName,
                    startDate: period2Data.startDate,
                    endDate: period2Data.endDate,
                    isClosed: period2Data.isClosed,
                    netProfit: period2Data.netProfit,
                    delinquency: period2Data.delinquency,
                },
                changes: {
                    netProfitChange: parseFloat(netProfitChange.toFixed(2)),
                    netProfitChangePercent: period1Data.netProfit !== 0
                        ? parseFloat(((netProfitChange / Math.abs(period1Data.netProfit)) * 100).toFixed(2))
                        : 0,
                    delinquencyChange: parseFloat(delinquencyChange.toFixed(2)),
                    delinquencyChangePercent: period1Data.delinquency !== 0
                        ? parseFloat(((delinquencyChange / period1Data.delinquency) * 100).toFixed(2))
                        : 0,
                },
                performance: {
                    profitabilityImproved,
                    profitabilityStatus: profitabilityImproved ? '✅ تحسن الربحية' : '❌ انخفاض الربحية',
                    delinquencyImproved,
                    delinquencyStatus: delinquencyImproved ? '✅ انخفاض التعثر' : '❌ ارتفاع التعثر',
                    overallStatus: (profitabilityImproved && delinquencyImproved)
                        ? '🟢 أداء ممتاز'
                        : (!profitabilityImproved && !delinquencyImproved)
                            ? '🔴 أداء متراجع'
                            : '🟡 أداء متوازن',
                },
            }
        };
    }
}