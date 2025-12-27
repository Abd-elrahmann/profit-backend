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
exports.SavingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const luxon_1 = require("luxon");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let SavingService = class SavingService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async getPartnerSavingSummary(partnerId) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                PartnerSavingAccrual: {
                    include: {
                        accrual: {
                            include: {
                                period: true
                            }
                        }
                    }
                }
            }
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const summaryByPeriod = partner.PartnerSavingAccrual.reduce((acc, a) => {
            const period = a.accrual?.period;
            const periodId = period?.id;
            const periodName = period?.name || 'Unknown';
            if (!acc[periodId]) {
                acc[periodId] = {
                    periodId,
                    periodName,
                    totalSaving: 0,
                    accruals: []
                };
            }
            acc[periodId].totalSaving += Number(a.savingAmount);
            acc[periodId].accruals.push({
                savingId: a.id,
                savingAmount: Number(a.savingAmount),
                date: a.createdAt,
                dateHijri: this.toHijri(a.createdAt)
            });
            return acc;
        }, {});
        return Object.values(summaryByPeriod);
    }
    async getAllPartnerSavings(page = 1, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const where = {};
        if (filters?.name)
            where.name = { contains: filters.name, mode: 'insensitive' };
        if (filters?.nationalId)
            where.nationalId = { contains: filters.nationalId, mode: 'insensitive' };
        if (filters?.phone)
            where.phone = { contains: filters.phone, mode: 'insensitive' };
        where.PartnerSavingAccrual = { some: {} };
        const totalPartners = await this.prisma.partner.count({ where });
        const totalPages = Math.ceil(totalPartners / limit);
        if (page > totalPages && totalPartners > 0)
            throw new common_1.NotFoundException('Page not found');
        const partners = await this.prisma.partner.findMany({
            where,
            skip,
            take: limit,
            orderBy: { id: 'asc' },
            include: {
                PartnerSavingAccrual: {
                    include: {
                        accrual: {
                            include: {
                                period: true,
                            },
                        },
                    },
                },
            },
        });
        const data = partners.map((p) => {
            const periodMap = new Map();
            p.PartnerSavingAccrual.forEach((s) => {
                const period = s.accrual?.period;
                const periodName = period?.name || 'Unknown';
                if (!periodMap.has(periodName)) {
                    periodMap.set(periodName, {
                        period: {
                            id: period?.id,
                            name: period?.name,
                            startDate: period?.startDate,
                            endDate: period?.endDate,
                            startdateHijri: period?.startDate ? this.toHijri(period.startDate) : null,
                            enddateHijri: period?.endDate ? this.toHijri(period.endDate) : null,
                        },
                        total: 0,
                        accrualCount: 0,
                    });
                }
                const record = periodMap.get(periodName);
                record.total += Number(s.savingAmount);
                record.accrualCount += 1;
            });
            return {
                partnerId: p.id,
                partnerName: p.name,
                periods: Array.from(periodMap.values()),
            };
        });
        return {
            data,
            pagination: { totalPartners, totalPages, currentPage: page, limit },
        };
    }
    async getSavingAccountReport(month) {
        let monthStart;
        let monthEnd;
        if (month) {
            const [year, monthNum] = month.split('-').map(Number);
            monthStart = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toUTC()
                .toJSDate();
            monthEnd = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: 'Asia/Riyadh' })
                .endOf('month')
                .endOf('day')
                .toUTC()
                .toJSDate();
        }
        const savingAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'SAVINGS' },
            include: {
                entries: {
                    where: { journal: { status: 'POSTED', ...(monthStart && monthEnd ? { date: { gte: monthStart, lte: monthEnd } } : {}) } },
                    include: { journal: { include: { postedBy: { select: { id: true, name: true } } } }, client: { select: { id: true, name: true } } },
                    orderBy: { id: 'desc' },
                },
            },
        });
        if (!savingAccount)
            throw new common_1.NotFoundException('Saving account not found');
        const groupedByMonth = savingAccount.entries.reduce((acc, entry) => {
            const date = luxon_1.DateTime.fromJSDate(entry.journal.date).setZone('Asia/Riyadh');
            const monthKey = date.toFormat('yyyy-LL');
            if (!acc[monthKey])
                acc[monthKey] = { entries: [], totalDebit: 0, totalCredit: 0, totalBalance: 0 };
            acc[monthKey].entries.push({
                id: entry.journal.id,
                date: date.toISO(),
                dateHijri: this.toHijri(entry.journal.date),
                reference: entry.journal.reference,
                description: entry.description ?? entry.journal.description,
                debit: entry.debit,
                credit: entry.credit,
                balance: entry.balance,
                client: entry.client?.name ?? null,
                postedBy: entry.journal.postedBy?.name ?? null,
                status: entry.journal.status,
                type: entry.journal.type,
            });
            acc[monthKey].totalDebit += entry.debit ?? 0;
            acc[monthKey].totalCredit += entry.credit ?? 0;
            acc[monthKey].totalBalance += entry.balance ?? 0;
            return acc;
        }, {});
        return {
            account: { id: savingAccount.id, name: savingAccount.name, code: savingAccount.code, debit: savingAccount.debit, credit: savingAccount.credit, balance: savingAccount.balance },
            totalJournalEntries: savingAccount.entries.length,
            journalsByMonth: groupedByMonth,
        };
    }
};
exports.SavingService = SavingService;
exports.SavingService = SavingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SavingService);
//# sourceMappingURL=saving.service.js.map