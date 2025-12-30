"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZakatService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const luxon_1 = require("luxon");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let ZakatService = class ZakatService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async getPartnerZakatSummary(partnerId, year) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: { PartnerNewCapital: { select: { amount: true, remaining: true } } }
        });
        if (!partner)
            throw new common_1.NotFoundException('Partner not found');
        const buildYearSummary = async (yr) => {
            const partnerStartYear = partner.createdAt ? new Date(partner.createdAt).getFullYear() : yr;
            const startMonth = yr === partnerStartYear
                ? new Date(partner.createdAt).getMonth() + 1
                : 1;
            const baseCapital = Number(partner.capitalAmount ?? 0);
            const newCapitalAmount = partner.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);
            const totalAmount = baseCapital + newCapitalAmount;
            const remainingMonths = 12 - startMonth + 1;
            const annualZakat = totalAmount * 0.025;
            const monthlyZakat = annualZakat / remainingMonths;
            const accruals = await this.prisma.zakatAccrual.findMany({
                where: { partnerId, year: yr },
                orderBy: { month: 'asc' },
            });
            const payments = await this.prisma.zakatPayment.findMany({
                where: { partnerId, year: yr },
            });
            const monthlyWithStatus = await Promise.all(accruals.map(async (acc) => {
                const payment = payments.find((p) => p.month === acc.month);
                let status = 'NOT_PAID';
                if (payment) {
                    const journal = await this.prisma.journalHeader.findFirst({
                        where: {
                            sourceType: 'ZAKAT',
                            sourceId: payment.id,
                            status: 'POSTED',
                        },
                    });
                    if (journal)
                        status = 'PAID';
                }
                return {
                    ...acc,
                    status,
                    paymentVoucher: payment?.PAYMENT_VOUCHER
                };
            }));
            const postedPayments = await Promise.all(payments.map(async (p) => {
                const journal = await this.prisma.journalHeader.findFirst({
                    where: {
                        sourceType: 'ZAKAT',
                        sourceId: p.id,
                        status: 'POSTED',
                    },
                });
                return journal ? p.amount : 0;
            }));
            const totalPaid = postedPayments.reduce((a, b) => a + b, 0);
            const remaining = annualZakat - totalPaid;
            return {
                partnerId,
                partnerName: partner.name,
                capitalAmount: totalAmount,
                year: yr,
                annualZakat,
                monthlyZakat,
                totalPaid,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: monthlyWithStatus,
            };
        };
        if (year) {
            return await buildYearSummary(year);
        }
        const allAccruals = await this.prisma.zakatAccrual.findMany({
            where: { partnerId },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });
        const distinctYears = [...new Set(allAccruals.map((a) => a.year))];
        const results = [];
        for (const yr of distinctYears) {
            results.push(await buildYearSummary(yr));
        }
        return results;
    }
    async getYearlyAllPartners(year, page = 1, limit) {
        const pageLimit = limit && limit > 0 ? limit : 10;
        const skip = (page - 1) * pageLimit;
        const totalPartners = await this.prisma.partner.count({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
        });
        const totalPages = Math.ceil(totalPartners / pageLimit);
        if (page > totalPages && totalPartners > 0) {
            throw new common_1.NotFoundException('Page not found');
        }
        if (totalPartners === 0) {
            return {
                data: [],
                pagination: {
                    totalPartners: 0,
                    totalPages: 0,
                    currentPage: page,
                    limit: pageLimit,
                    hasNextPage: false,
                    hasPreviousPage: false,
                },
            };
        }
        const partners = await this.prisma.partner.findMany({
            where: {
                OR: [
                    {
                        ZakatAccrual: {
                            some: {
                                year: year,
                            },
                        },
                    },
                    {
                        ZakatPayment: {
                            some: {
                                year: year,
                            },
                        },
                    },
                ],
            },
            skip,
            take: pageLimit,
            orderBy: { id: 'asc' },
            include: {
                PartnerNewCapital: { select: { amount: true, remaining: true } },
                ZakatAccrual: {
                    where: { year },
                    orderBy: { month: 'asc' },
                },
            },
        });
        const results = [];
        for (const p of partners) {
            const partnerStartYear = p.createdAt ? new Date(p.createdAt).getFullYear() : new Date().getFullYear();
            const startMonth = year === partnerStartYear
                ? new Date(p.createdAt).getMonth() + 1
                : 1;
            const remainingMonths = 12 - startMonth + 1;
            const baseCapital = Number(p.capitalAmount ?? 0);
            const newCapitalAmount = p.PartnerNewCapital
                .reduce((sum, c) => sum + Number(c.remaining ?? 0), 0);
            const totalAmount = baseCapital + newCapitalAmount;
            const annualZakat = totalAmount * 0.025;
            const zakattofixed = Number(annualZakat.toFixed(2));
            const monthlyZakat = zakattofixed / remainingMonths;
            const payments = await this.prisma.zakatPayment.aggregate({
                where: { partnerId: p.id, year },
                _sum: { amount: true },
            });
            const paidAmount = payments._sum.amount || 0;
            const remaining = annualZakat - paidAmount;
            results.push({
                partnerId: p.id,
                partnerName: p.name,
                capitalAmount: totalAmount,
                year,
                annualZakat,
                monthlyZakat,
                totalPaid: paidAmount,
                remaining: remaining < 0 ? 0 : remaining,
                monthlyBreakdown: p.ZakatAccrual,
            });
        }
        return {
            data: results,
            pagination: {
                totalPartners,
                totalPages,
                currentPage: page,
                limit: pageLimit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }
    async withdrawZakat(amount, userId) {
        if (amount <= 0) {
            throw new common_1.BadRequestException("المبلغ يجب أن يكون أكبر من صفر");
        }
        const zakatAccount = await this.prisma.account.findUnique({ where: { code: '20001' } });
        if (!zakatAccount)
            throw new common_1.BadRequestException('zakat account (20001) must exist');
        if (zakatAccount.balance < amount) {
            throw new common_1.BadRequestException("الرصيد في حساب الزكاة غير كافٍ للسحب");
        }
        const bankAccount = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bankAccount)
            throw new common_1.NotFoundException("Bank account not found");
        if (bankAccount.balance < amount) {
            throw new common_1.BadRequestException("الرصيد في الصندوق غير كافٍ للسحب");
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const reference = `ZAKAT-WITHDRAW-${zakatAccount.id}-${year}-${month}`;
        const journal = await this.journalService.createJournal({
            reference,
            description: `سحب مبلغ زكاة قدره ${amount}`,
            type: 'GENERAL',
            sourceType: 'ZAKAT',
            sourceId: undefined,
            lines: [
                {
                    accountId: zakatAccount.id,
                    debit: amount,
                    credit: 0,
                    description: 'سحب مبلغ الزكاة من حساب الزكاة',
                },
                {
                    accountId: bankAccount.id,
                    debit: 0,
                    credit: amount,
                    description: 'سحب مبلغ الزكاة من الحساب البنكي',
                },
            ],
        }, userId);
        await this.journalService.postJournal(journal.journal.id, userId);
        await this.prisma.zakatWithdraw.create({
            data: {
                amount: amount,
                userId: userId,
            }
        });
        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Zakat',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بسحب مبلغ زكاة قدره ${amount}`,
            },
        });
        return {
            message: "تم سحب مبلغ الزكاة بنجاح",
            journalId: journal.journal.id
        };
    }
    async getZakatAccountReport(month) {
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
        const zakatAccount = await this.prisma.account.findUnique({
            where: { code: '20001' },
            include: {
                entries: {
                    where: {
                        journal: {
                            status: 'POSTED',
                            ...(monthStart && monthEnd ? { date: { gte: monthStart, lte: monthEnd } } : {}),
                        },
                    },
                    include: {
                        journal: {
                            include: {
                                postedBy: { select: { id: true, name: true } },
                            },
                        },
                        client: { select: { id: true, name: true } },
                    },
                    orderBy: { id: 'desc' },
                },
            },
        });
        if (!zakatAccount)
            throw new common_1.NotFoundException('Zakat account not found');
        const groupedByMonth = zakatAccount.entries.reduce((acc, entry) => {
            const date = luxon_1.DateTime.fromJSDate(entry.journal.date).setZone('Asia/Riyadh');
            const monthKey = date.toFormat('yyyy-LL');
            if (!acc[monthKey]) {
                acc[monthKey] = { entries: [], totalDebit: 0, totalCredit: 0, totalBalance: 0, requiredZakat: 0 };
            }
            const mapped = {
                id: entry.journal.id,
                date: date.toISO(),
                hijriDate: this.toHijri(entry.journal.date),
                reference: entry.journal.reference,
                description: entry.description ?? entry.journal.description,
                debit: entry.debit,
                credit: entry.credit,
                balance: entry.balance,
                client: entry.client?.name ?? null,
                postedBy: entry.journal.postedBy?.name ?? null,
                status: entry.journal.status,
                type: entry.journal.type,
            };
            acc[monthKey].entries.push(mapped);
            acc[monthKey].totalDebit += entry.debit ?? 0;
            acc[monthKey].totalCredit += entry.credit ?? 0;
            acc[monthKey].totalBalance += entry.balance ?? 0;
            return acc;
        }, {});
        const zakatAccruals = await this.prisma.zakatAccrual.findMany({
            where: {
                ...(monthStart && monthEnd
                    ? {
                        year: Number(month?.split('-')[0]),
                        month: Number(month?.split('-')[1]),
                    }
                    : {}),
            },
        });
        if (Object.keys(groupedByMonth).length === 0) {
            let monthKey;
            let yearNum;
            let monthNum;
            if (month) {
                [yearNum, monthNum] = month.split('-').map(Number);
            }
            else {
                const now = luxon_1.DateTime.now().setZone('Asia/Riyadh');
                yearNum = now.year;
                monthNum = now.month;
            }
            monthKey = `${yearNum}-${monthNum.toString().padStart(2, '0')}`;
            const monthTotal = zakatAccruals
                .filter((z) => z.year === yearNum && z.month === monthNum)
                .reduce((sum, z) => sum + z.amount, 0);
            groupedByMonth[monthKey] = {
                entries: [],
                totalDebit: 0,
                totalCredit: 0,
                totalBalance: 0,
                requiredZakat: monthTotal,
            };
        }
        Object.keys(groupedByMonth).forEach((monthKey) => {
            const [year, monthNum] = monthKey.split('-').map(Number);
            const monthTotal = zakatAccruals
                .filter((z) => z.year === year && z.month === monthNum)
                .reduce((sum, z) => sum + z.amount, 0);
            groupedByMonth[monthKey].requiredZakat = monthTotal;
        });
        return {
            account: {
                id: zakatAccount.id,
                name: zakatAccount.name,
                code: zakatAccount.code,
                debit: zakatAccount.debit,
                credit: zakatAccount.credit,
                balance: zakatAccount.balance,
            },
            totalJournalEntries: zakatAccount.entries.length,
            journalsByMonth: groupedByMonth,
        };
    }
    async uploadDocument(currentUser, file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const uploadDir = path.join(process.cwd(), 'uploads', 'zakat');
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, file.originalname);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        const zakatWithdraw = await this.prisma.zakatWithdraw.findFirst({
            where: { userId: currentUser },
            orderBy: { createdAt: 'desc' },
        });
        await this.prisma.zakatWithdraw.update({
            where: { id: zakatWithdraw?.id },
            data: { document: publicUrl },
        });
        return { message: 'تم رفع المستند بنجاح', path: publicUrl };
    }
};
exports.ZakatService = ZakatService;
exports.ZakatService = ZakatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], ZakatService);
//# sourceMappingURL=zakat.service.js.map