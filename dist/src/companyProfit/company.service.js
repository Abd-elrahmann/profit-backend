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
exports.CompanyService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const journal_service_1 = require("../journal/journal.service");
const luxon_1 = require("luxon");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let CompanyService = class CompanyService {
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
    async withdrawProfit(amount, userId) {
        if (amount <= 0)
            throw new common_1.BadRequestException('المبلغ يجب أن يكون أكبر من صفر');
        const bank = await this.prisma.account.findUnique({ where: { code: "11000" } });
        if (!bank)
            throw new common_1.NotFoundException('لم يتم العثور على حساب البنك');
        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount)
            throw new common_1.NotFoundException('لم يتم العثور على حساب أرباح الشركة');
        if (companyProfitAccount.balance < amount)
            throw new common_1.BadRequestException('رصيد أرباح الشركة غير كافٍ لإجراء عملية السحب');
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const journal = await this.journalService.createJournal({
            reference: `COMPANY-WITHDRAW-${luxon_1.DateTime.now().toFormat('yyyyLLdd-HHmm')}`,
            description: 'سحب أرباح الشركة',
            type: 'GENERAL',
            sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
            lines: [
                {
                    accountId: bank.id,
                    debit: 0,
                    credit: amount,
                    description: 'سحب أرباح الشركة من حساب البنك',
                },
                {
                    accountId: companyProfitAccount.id,
                    debit: amount,
                    credit: 0,
                    description: 'إثبات سحب أرباح الشركة',
                },
            ],
        }, userId);
        await this.journalService.postJournal(journal.journal.id, userId);
        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Company Profit',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بسحب مبلغ (${amount}) من أرباح الشركة وتم تسجيل قيد محاسبي رقم (${journal.journal.id}).`,
            },
        });
        return { message: 'تم سحب الأرباح بنجاح' };
    }
    async getProfitReport(page, filters) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;
        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount)
            throw new common_1.NotFoundException('Company profit account not found');
        const where = {
            sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
            status: 'POSTED',
        };
        if (filters?.search) {
            where.OR = [
                { reference: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
            ];
        }
        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                where.date.gte = luxon_1.DateTime.fromISO(filters.startDate, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
            }
            if (filters.endDate) {
                where.date.lte = luxon_1.DateTime.fromISO(filters.endDate, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
            }
        }
        const totalWithdrawals = await this.prisma.journalHeader.count({ where });
        const totalPages = Math.ceil(totalWithdrawals / limit);
        const withdrawals = await this.prisma.journalHeader.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { lines: true },
        });
        const formattedWithdrawals = withdrawals.map((j) => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: luxon_1.DateTime.fromJSDate(j.date)
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd'),
            hijriDate: this.toHijri(j.date),
            amount: j.lines.reduce((sum, l) => sum + l.credit, 0),
        }));
        const closingJournals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: 'PERIOD_CLOSING',
                status: 'POSTED',
            },
            include: {
                period: true,
                lines: {
                    include: { account: true },
                },
            },
            orderBy: { date: 'asc' },
        });
        const periods = closingJournals.map((journal) => {
            const totalPeriodProfit = journal.lines
                .filter(l => l.account.accountBasicType === 'LOAN_INCOME')
                .reduce((sum, l) => sum + l.debit, 0);
            const companyProfit = journal.lines
                .filter(l => l.accountId === companyProfitAccount.id)
                .reduce((sum, l) => sum + l.credit, 0);
            const roundToTwo = (num) => Math.round(num * 100) / 100;
            const companyProfitPercentage = roundToTwo(companyProfit * 100 / totalPeriodProfit);
            return {
                periodId: journal.period?.id,
                periodName: journal.period?.name,
                date: luxon_1.DateTime.fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-MM-dd'),
                hijriDate: this.toHijri(journal.date),
                totalPeriodProfit,
                companyProfit,
                companyPercentage: companyProfitPercentage,
            };
        });
        const totalCompanyProfitFromPeriods = periods.reduce((sum, p) => sum + p.companyProfit, 0);
        return {
            totalPages,
            currentPage: page,
            limit,
            availableAmount: companyProfitAccount.balance,
            totalWithdrawals,
            data: formattedWithdrawals,
            periodsProfit: {
                totalCompanyProfit: totalCompanyProfitFromPeriods,
                periodsCount: periods.length,
                periods,
            },
        };
    }
};
exports.CompanyService = CompanyService;
exports.CompanyService = CompanyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], CompanyService);
//# sourceMappingURL=company.service.js.map