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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
let DistributionService = class DistributionService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    async postClosing(periodId, userId, savingPercentage) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period)
            throw new common_1.NotFoundException('Period not found');
        if (period.isClosed === false)
            throw new common_1.BadRequestException('الفترة غير مغلقة');
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        const closingJournalId = period.closingJournalId || 0;
        await this.journalService.postJournal(closingJournalId, userId);
        const accruals = await this.prisma.partnerPeriodProfit.findMany({
            where: { periodId: periodId },
            include: { partner: true },
        });
        if (!accruals.length)
            throw new common_1.BadRequestException('لا توجد أرباح لتوزيعها لهذه الفترة');
        const closingJournal = await this.prisma.journalHeader.findUnique({
            where: { id: closingJournalId },
            include: {
                lines: {
                    include: { account: true },
                },
            },
        });
        const partnerAmountMap = new Map();
        if (closingJournal && closingJournal.lines.length > 0) {
            for (const line of closingJournal.lines) {
                for (const accrual of accruals) {
                    const partner = accrual.partner;
                    if (line.accountId === partner.accountPayableId ||
                        line.accountId === partner.accountEquityId) {
                        const currentAmount = partnerAmountMap.get(partner.id) || 0;
                        partnerAmountMap.set(partner.id, currentAmount + Number(line.credit));
                    }
                }
            }
        }
        for (const [partnerId, amount] of partnerAmountMap) {
            await this.prisma.partner.update({
                where: { id: partnerId },
                data: {
                    totalProfit: { increment: amount },
                    totalAmount: { increment: amount },
                },
            });
        }
        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount)
            throw new common_1.BadRequestException('حساب الادخار (20002) يجب ان يكون موجود');
        const Bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!Bank)
            throw new common_1.BadRequestException('bank is not existed');
        if (savingPercentage && savingPercentage > 0) {
            for (const acc of accruals) {
                const partner = acc.partner;
                const totalProfit = Number(acc.totalProfit);
                const partnerEquity = await this.prisma.account.findUnique({ where: { id: partner.accountEquityId } });
                if (!partnerEquity)
                    throw new common_1.BadRequestException('لا يوجد حساب رأس مال');
                const partnerSaving = await this.prisma.account.findUnique({ where: { id: partner.accountSavingId } });
                if (!partnerSaving)
                    throw new common_1.BadRequestException('لا يوجد حساب ادخار');
                let savingAmount = (totalProfit * savingPercentage) / 100;
                if ((partnerEquity.balance - partnerSaving.balance) < savingAmount) {
                    savingAmount = partnerEquity.balance - partnerSaving.balance;
                }
                if (partnerEquity.balance > partnerSaving.balance) {
                    const savingRecord = await this.prisma.partnerSavingAccrual.create({
                        data: {
                            partnerId: partner.id,
                            periodId: periodId,
                            accrualId: acc.id,
                            savingAmount: savingAmount,
                        },
                    });
                    const savingJournal = await this.journalService.createJournal({
                        reference: `SAVE-${partner.id}-${periodId}`,
                        description: `ادخار بنسبة ${savingPercentage}% للشريك ${partner.name}`,
                        type: 'GENERAL',
                        sourceType: 'SAVING',
                        sourceId: savingRecord.id,
                        lines: [
                            {
                                accountId: partner.accountSavingId,
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
                    }, userId);
                    await this.journalService.postJournal(savingJournal.journal.id, userId);
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
        await this.prisma.partnerShareAccrual.updateMany({
            where: { periodId: periodId },
            data: { isDistributed: true },
        });
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
    async reverseClosing(periodId, userId) {
        const period = await this.prisma.periodHeader.findUnique({ where: { id: periodId } });
        if (!period)
            throw new common_1.NotFoundException('Period not found');
        if (period.isClosed === false)
            throw new common_1.BadRequestException('الفترة غير مغلقة');
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        const closingJournalId = period.closingJournalId || 0;
        const accruals = await this.prisma.partnerPeriodProfit.findMany({
            where: { periodId: periodId },
            include: { partner: true },
        });
        const closingJournal = await this.prisma.journalHeader.findUnique({
            where: { id: closingJournalId },
            include: {
                lines: {
                    include: { account: true },
                },
            },
        });
        const partnerAmountMap = new Map();
        if (closingJournal && closingJournal.lines.length > 0) {
            for (const line of closingJournal.lines) {
                for (const accrual of accruals) {
                    const partner = accrual.partner;
                    if (line.accountId === partner.accountPayableId ||
                        line.accountId === partner.accountEquityId) {
                        const currentAmount = partnerAmountMap.get(partner.id) || 0;
                        partnerAmountMap.set(partner.id, currentAmount + Number(line.credit));
                    }
                }
            }
        }
        await this.journalService.unpostJournal(userId, closingJournalId);
        for (const [partnerId, amount] of partnerAmountMap) {
            await this.prisma.partner.update({
                where: { id: partnerId },
                data: {
                    totalProfit: { decrement: amount },
                    totalAmount: { decrement: amount },
                },
            });
        }
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
                });
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
    async getClosedPeriods(periodId) {
        const whereCondition = { isClosed: true };
        if (periodId)
            whereCondition.id = periodId;
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
        if (periods.length === 0)
            return [];
        const savings = await this.prisma.partnerSavingAccrual.findMany({
            where: {
                periodId: periodId ? periodId : { in: periods.map(p => p.id) }
            }
        });
        const savingMap = new Map();
        savings.forEach(s => {
            if (!savingMap.has(s.periodId))
                savingMap.set(s.periodId, new Map());
            savingMap.get(s.periodId).set(s.partnerId, Number(s.savingAmount));
        });
        return await Promise.all(periods.map(async (p) => {
            const distributionJournal = await this.prisma.journalHeader.findUnique({
                where: { id: p.closingJournalId || 0 },
            });
            const companyProfit = p.journals
                .flatMap(j => j.lines)
                .filter(l => l.account.accountBasicType === 'COMPANY_SHARES')
                .reduce((sum, l) => sum + Number(l.credit), 0);
            const periodSavingMap = savingMap.get(p.id) || new Map();
            const partners = p.PartnerPeriodProfit.map(pp => {
                const savingAmount = periodSavingMap.get(pp.partnerId) ?? 0;
                return {
                    partnerId: pp.partnerId,
                    partnerName: pp.partner.name,
                    nationalId: pp.partner.nationalId,
                    phone: pp.partner.phone,
                    orgProfitPercent: pp.partner.orgProfitPercent,
                    totalProfit: Number(pp.totalProfit),
                    savingAmount,
                    totalAfterSaving: Number(pp.totalProfit) - savingAmount
                };
            });
            return {
                periodId: p.id,
                name: p.name,
                startDate: p.startDate,
                endDate: p.endDate,
                closingJournalId: p.closingJournalId,
                isDistributed: distributionJournal?.status === 'POSTED',
                companyProfit,
                totalSaving: partners.reduce((sum, pr) => sum + pr.savingAmount, 0),
                totalAfterSaving: partners.reduce((sum, pr) => sum + pr.totalAfterSaving, 0),
                partners,
                distributionJournal: distributionJournal || null
            };
        }));
    }
};
exports.DistributionService = DistributionService;
exports.DistributionService = DistributionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], DistributionService);
//# sourceMappingURL=distribution.service.js.map