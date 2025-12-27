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
exports.IncomeStatementService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const luxon_1 = require("luxon");
let IncomeStatementService = class IncomeStatementService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getIncomeStatement(params) {
        const { fromDate, toDate, month, year, periodId } = params;
        let from;
        let to;
        const now = luxon_1.DateTime.now().setZone('Asia/Riyadh');
        if (periodId) {
            const period = await this.prisma.periodHeader.findUnique({
                where: { id: periodId },
            });
            if (!period) {
                throw new common_1.BadRequestException('الفترة المحاسبية غير موجودة');
            }
            from = luxon_1.DateTime
                .fromJSDate(period.startDate)
                .setZone('Asia/Riyadh')
                .startOf('day')
                .toUTC()
                .toJSDate();
            to = period.endDate
                ? luxon_1.DateTime.fromJSDate(period.endDate)
                    .setZone('Asia/Riyadh')
                    .endOf('day')
                    .toUTC()
                    .toJSDate()
                : now.endOf('day').toUTC().toJSDate();
        }
        else if (month && year) {
            from = luxon_1.DateTime
                .fromObject({ year, month, day: 1 }, { zone: 'Asia/Riyadh' })
                .startOf('month')
                .toUTC()
                .toJSDate();
            to = luxon_1.DateTime
                .fromObject({ year, month, day: 1 }, { zone: 'Asia/Riyadh' })
                .endOf('month')
                .toUTC()
                .toJSDate();
        }
        else if (fromDate && toDate) {
            from = luxon_1.DateTime
                .fromISO(fromDate, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toUTC()
                .toJSDate();
            to = luxon_1.DateTime
                .fromISO(toDate, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toUTC()
                .toJSDate();
        }
        else {
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { isClosed: false },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new common_1.BadRequestException('لا توجد فترة محاسبية مفتوحة');
            }
            from = luxon_1.DateTime
                .fromJSDate(currentPeriod.startDate)
                .setZone('Asia/Riyadh')
                .startOf('day')
                .toUTC()
                .toJSDate();
            to = now.endOf('day').toUTC().toJSDate();
        }
        const partners = await this.prisma.partner.findMany({
            where: {
                createdAt: { gte: from, lte: to },
                isActive: true
            },
            select: {
                id: true,
                name: true,
                capitalAmount: true,
                orgProfitPercent: true,
                PartnerNewCapital: { select: { amount: true, remaining: true } },
            },
        });
        const capitalByPartner = partners.map(partner => {
            const totalNewCapital = partner.PartnerNewCapital?.reduce((s, nc) => s + Number(nc.amount || 0), 0) || 0;
            const remainingNewCapital = partner.PartnerNewCapital?.reduce((s, nc) => s + Number(nc.remaining || 0), 0) || 0;
            return {
                partnerId: partner.id,
                partnerName: partner.name,
                capitalAmount: Number(partner.capitalAmount || 0),
                newCapitalTotal: totalNewCapital,
                newCapitalRemaining: remainingNewCapital,
                profitPercentage: partner.orgProfitPercent,
            };
        });
        const totalCapital = capitalByPartner.reduce((sum, p) => sum + p.capitalAmount + p.newCapitalTotal, 0);
        const revenueJournals = await this.prisma.journalHeader.findMany({
            where: {
                date: { gte: from, lte: to },
                status: 'POSTED',
            },
            include: {
                lines: {
                    include: {
                        account: true,
                        client: true,
                    },
                },
            },
        });
        const DATE_FORMAT = 'yyyy-MM-dd';
        let totalRevenue = 0;
        let totalRevenueGeneral = 0;
        let totalRevenueNewCapital = 0;
        const revenueByClientMap = new Map();
        for (const journal of revenueJournals) {
            if (journal.sourceType !== 'REPAYMENT' || !journal.sourceId)
                continue;
            const repayment = await this.prisma.repayment.findUnique({
                where: { id: journal.sourceId },
                include: { loan: true },
            });
            if (!repayment || !repayment.loan)
                continue;
            const revenueLine = journal.lines.find(l => l.account.type === 'REVENUE' && l.credit > 0);
            if (!revenueLine)
                continue;
            const amount = revenueLine.credit - revenueLine.debit;
            if (amount <= 0)
                continue;
            totalRevenue += amount;
            if (repayment.loan.source === 'GENERAL') {
                totalRevenueGeneral += amount;
            }
            else if (repayment.loan.source === 'NEW_CAPITAL') {
                totalRevenueNewCapital += amount;
            }
            const clientLine = journal.lines.find(l => l.clientId !== null);
            if (!clientLine || !clientLine.client)
                continue;
            const clientId = clientLine.client.id;
            if (!revenueByClientMap.has(clientId)) {
                revenueByClientMap.set(clientId, {
                    clientId,
                    clientName: clientLine.client.name,
                    totalAmount: 0,
                    entries: [],
                });
            }
            const clientGroup = revenueByClientMap.get(clientId);
            clientGroup.totalAmount += amount;
            clientGroup.entries.push({
                journalId: journal.id,
                date: luxon_1.DateTime
                    .fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat(DATE_FORMAT),
                amount,
                description: revenueLine.description ||
                    journal.description ||
                    'إيراد',
            });
        }
        const revenueByClient = Array.from(revenueByClientMap.values());
        const expenseRecords = await this.prisma.expenseRecord.findMany({
            where: { createdAt: { gte: from, lte: to } },
            include: {
                user: { select: { id: true, name: true } },
                employee: { select: { id: true, name: true } },
                journal: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        let totalExpenses = 0;
        const detailedExpenses = expenseRecords.map((e) => {
            totalExpenses += e.amount;
            return {
                type: e.type,
                amount: e.amount,
                description: e.description,
                employee: e.employee?.name || null,
                createdAt: luxon_1.DateTime
                    .fromJSDate(e.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat(DATE_FORMAT),
            };
        });
        const netProfit = totalRevenueGeneral - totalExpenses;
        return {
            period: {
                from: luxon_1.DateTime.fromJSDate(from).setZone('Asia/Riyadh').toFormat('yyyy-MM-dd'),
                to: luxon_1.DateTime.fromJSDate(to).setZone('Asia/Riyadh').toFormat('yyyy-MM-dd'),
                source: periodId
                    ? 'PERIOD'
                    : month && year
                        ? 'MONTH'
                        : fromDate && toDate
                            ? 'CUSTOM'
                            : 'CURRENT_PERIOD',
                periodId: periodId ?? null,
            },
            totalCapital,
            capitalByPartner,
            totalRevenue,
            revenues: {
                total: totalRevenue,
                generalLoans: totalRevenueGeneral,
                newCapitalLoans: totalRevenueNewCapital,
            },
            revenueByClient,
            totalExpenses,
            detailedExpenses,
            netProfit,
        };
    }
};
exports.IncomeStatementService = IncomeStatementService;
exports.IncomeStatementService = IncomeStatementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], IncomeStatementService);
//# sourceMappingURL=income-statement.service.js.map