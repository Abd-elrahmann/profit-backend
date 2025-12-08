"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const client_1 = require("@prisma/client");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let PeriodService = class PeriodService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    toHijri(date) {
        if (!date)
            return null;
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async closePeriod(periodId, closingUserId) {
        return await this.prisma.$transaction(async (tx) => {
            const period = await tx.periodHeader.findUnique({ where: { id: periodId } });
            if (!period)
                throw new common_1.NotFoundException('Period not found');
            if (period.closingJournalId) {
                throw new common_1.BadRequestException('الفترة مغلقة بالفعل.');
            }
            const user = await this.prisma.user.findUnique({
                where: { id: closingUserId },
            });
            const drafts = await tx.journalHeader.findMany({
                where: { periodId, status: { not: 'POSTED' } },
            });
            if (drafts.length > 0) {
                throw new common_1.BadRequestException(`لا يمكن إغلاق الفترة: هناك ${drafts.length} قيود غير معتمدة.`);
            }
            const accruals = await tx.partnerShareAccrual.findMany({
                where: { periodId: periodId },
                include: { partner: true },
            });
            const accrualsByPartner = new Map();
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
            if (!LOAN_INCOME)
                throw new common_1.BadRequestException('LOAN_INCOME account is missing');
            if (!COMPANY_SHARES)
                throw new common_1.BadRequestException('COMPANY_SHARES account is missing');
            const lines = [];
            for (const [, v] of accrualsByPartner) {
                lines.push({
                    accountId: LOAN_INCOME.id,
                    debit: Number(v.partnerFinal.toFixed(2)),
                    credit: 0,
                    description: 'نصيب المساهمين للفترة',
                });
                lines.push({
                    accountId: v.partnerAccountId,
                    debit: 0,
                    credit: Number(v.partnerFinal.toFixed(2)),
                    description: 'نصيب المساهم من أرباح الشركة',
                });
            }
            if (totalCompanyShare > 0) {
                lines.push({
                    accountId: LOAN_INCOME.id,
                    debit: Number(totalCompanyShare.toFixed(2)),
                    credit: 0,
                    description: 'نصيب الشركة من أرباح المساهمين',
                });
                lines.push({
                    accountId: COMPANY_SHARES.id,
                    debit: 0,
                    credit: Number(totalCompanyShare.toFixed(2)),
                    description: 'نصيب الشركة من أرباح المساهمين',
                });
            }
            let closingJournalId = null;
            if (lines.length > 0) {
                const created = await this.journalService.createJournal({
                    periodId: period.id,
                    reference: `CLOSE-PERIOD-${period.id}-${Date.now()}`,
                    description: `إقفال فترة ${period.name}`,
                    type: 'CLOSING',
                    sourceType: client_1.JournalSourceType.PERIOD_CLOSING,
                    sourceId: period.id,
                    lines,
                }, closingUserId);
                closingJournalId = created?.journal?.id ?? null;
            }
            for (const a of accruals) {
                await tx.partnerShareAccrual.update({
                    where: { id: a.id },
                    data: { isClosed: true },
                });
            }
            for (const [partnerId, sums] of accrualsByPartner.entries()) {
                await tx.partnerPeriodProfit.create({
                    data: {
                        partnerId,
                        periodId: period.id,
                        totalProfit: Number(sums.partnerFinal.toFixed(2)),
                    },
                });
            }
            await this.closeAccountsWithParents(tx, periodId);
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
            const newPeriod = await tx.periodHeader.create({
                data: {
                    name: `فترة مفتوحة تبدأ من ${new Date().toISOString().slice(0, 10)}`,
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
            await this.prisma.auditLog.create({
                data: {
                    userId: closingUserId,
                    screen: 'Period',
                    action: 'UPDATE',
                    description: `قام المستخدم ${user?.name} بإغلاق الفترة ${period.name} (${period.id})`,
                },
            });
            return {
                message: 'تم إغلاق الفترة بنجاح.',
                periodId: period.id,
                newPeriodId: newPeriod.id,
            };
        });
    }
    async closeAccountsWithParents(tx, periodId) {
        const accounts = await tx.account.findMany({
            select: { id: true, parentId: true, nature: true },
        });
        const periodLines = new Map();
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
        const prevClosings = new Map();
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
        const childrenMap = new Map();
        for (const acc of accounts) {
            if (acc.parentId) {
                if (!childrenMap.has(acc.parentId))
                    childrenMap.set(acc.parentId, []);
                childrenMap.get(acc.parentId).push(acc.id);
            }
        }
        const computed = new Map();
        const compute = async (accountId) => {
            if (computed.has(accountId))
                return computed.get(accountId);
            const acc = accounts.find(a => a.id === accountId);
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
            let closingBalance;
            if (acc.nature === 'DEBIT') {
                closingBalance = openingBalance + totalDebit - totalCredit;
            }
            else {
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
            return computed.get(accountId);
        };
        for (const acc of accounts) {
            await compute(acc.id);
        }
    }
    async reversePeriodClosing(periodId, userId) {
        return await this.prisma.$transaction(async (tx) => {
            const period = await tx.periodHeader.findUnique({
                where: { id: periodId },
            });
            if (!period)
                throw new common_1.NotFoundException("Period not found");
            if (period.isClosed === false) {
                throw new common_1.BadRequestException("الفترة مفتوحة بالفعل.");
            }
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
            if (periodId !== (await tx.periodHeader.findFirst({
                where: { isClosed: true },
                orderBy: { startDate: 'desc' },
            }))?.id) {
                throw new common_1.BadRequestException("يجب عكس إغلاق الفترة المغلقة الأخيرة أولاً.");
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
    async getPeriodDetails(periodId) {
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
        if (!period)
            throw new common_1.NotFoundException('Period not found');
        const savings = await this.prisma.partnerSavingAccrual.findMany({
            where: { periodId },
            select: { partnerId: true, savingAmount: true }
        });
        const savingMap = new Map();
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
        let partnerProfits = [];
        let totalPartnerProfit = 0;
        let companyProfit = 0;
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
            partnerProfits = partnerProfits.map(p => {
                const savingAmount = savingMap.get(p.partnerId) ?? 0;
                return {
                    ...p,
                    savingAmount,
                    totalAfterSaving: Math.round((p.totalProfit - savingAmount) * 100) / 100
                };
            });
            totalPartnerProfit = partnerProfits.reduce((sum, partner) => sum + (partner.totalAfterSaving ?? partner.totalProfit), 0);
            const closingJournal = period.journals.find(j => j.id === period.closingJournalId);
            if (closingJournal) {
                const companyShareLines = closingJournal.lines.filter(line => line.account.accountBasicType === 'COMPANY_SHARES');
                companyProfit = companyShareLines.reduce((sum, line) => sum + Number(line.credit), 0);
            }
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
                journals,
                partnerProfits,
                companyProfit,
                totalPartnerProfit,
                isClosed: period.isClosed
            };
        }
        else {
            const profitCalculation = await this.calculateOpenPeriodProfits(periodId);
            partnerProfits = profitCalculation.partnerProfits;
            totalPartnerProfit = profitCalculation.totalPartnerProfit;
            companyProfit = profitCalculation.companyProfit;
            return {
                id: period.id,
                name: period.name,
                startDate: period.startDate,
                startDateHijri: this.toHijri(period.startDate),
                endDate: period.endDate,
                endDateHijri: this.toHijri(period.endDate),
                journals,
                partnerProfits,
                companyProfit,
                totalPartnerProfit,
                isClosed: period.isClosed
            };
        }
    }
    async calculateOpenPeriodProfits(periodId) {
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
        const partnerProfits = [];
        let totalPartnerProfit = 0;
        let companyProfit = 0;
        if (allAccruals.length > 0) {
            const profitByPartner = new Map();
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
    async getAllPeriods(page = 1, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.startDate)
            where.startDate = { gte: new Date(filters.startDate) };
        if (filters?.endDate)
            where.endDate = { lte: new Date(filters.endDate + "T23:59:59") };
        if (filters?.isClosed !== undefined) {
            where.isClosed = typeof filters.isClosed === 'string' ? filters.isClosed === 'true' : Boolean(filters.isClosed);
        }
        const totalPeriods = await this.prisma.periodHeader.count({ where });
        const totalPages = Math.ceil(totalPeriods / limit);
        if (page > totalPages && totalPeriods > 0)
            throw new common_1.NotFoundException("Page not found");
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
};
exports.PeriodService = PeriodService;
exports.PeriodService = PeriodService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], PeriodService);
//# sourceMappingURL=period.service.js.map