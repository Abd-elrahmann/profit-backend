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
exports.AccountsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const luxon_1 = require("luxon");
const moment_hijri_1 = __importDefault(require("moment-hijri"));
let AccountsService = class AccountsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async createAccount(dto) {
        if (dto.parentId) {
            const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
            if (!parent)
                throw new common_1.NotFoundException('Parent account not found');
        }
        const exists = await this.prisma.account.findUnique({ where: { code: dto.code } });
        if (exists)
            throw new common_1.BadRequestException('رمز الحساب موجود بالفعل');
        const account = await this.prisma.account.create({ data: dto });
        return { message: 'تم انشاء الحساب بنجاح', account };
    }
    async updateAccount(id, dto) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        const updated = await this.prisma.account.update({
            where: { id },
            data: dto,
        });
        return { message: 'تم تعديل الحساب بنجاح', account: updated };
    }
    async deleteAccount(id) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        const hasChildren = await this.prisma.account.findFirst({ where: { parentId: id } });
        if (hasChildren)
            throw new common_1.BadRequestException('لا يمكن حذف حساب لديه حسابات فرعية');
        await this.prisma.account.delete({ where: { id } });
        return { message: 'تم حذف الحساب بنجاح' };
    }
    async getAllAccounts(page = 1, limit = 10, filters) {
        const where = {};
        if (filters?.search) {
            const search = filters.search.trim();
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }
        const accounts = await this.prisma.account.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { code: 'asc' },
        });
        const total = await this.prisma.account.count({ where });
        return {
            total,
            page,
            limit,
            accounts,
        };
    }
    async getAccountDetails(id) {
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        return account;
    }
    async getAccountById(id, page = 1, options = {}) {
        const { from, to, limit = 10 } = options;
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account)
            throw new common_1.NotFoundException('Account not found');
        const dateFilter = {};
        if (from) {
            const saudiFrom = luxon_1.DateTime.fromISO(from, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toJSDate();
            dateFilter.gte = saudiFrom;
        }
        if (to) {
            const saudiTo = luxon_1.DateTime.fromISO(to, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toJSDate();
            dateFilter.lte = saudiTo;
        }
        const totalJournals = await this.prisma.journalHeader.count({
            where: {
                status: 'POSTED',
                lines: { some: { accountId: id } },
                ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
            },
        });
        const journals = await this.prisma.journalHeader.findMany({
            where: {
                status: 'POSTED',
                lines: { some: { accountId: id } },
                ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
            },
            include: {
                lines: {
                    where: { accountId: id },
                    include: {
                        account: { select: { id: true, name: true, code: true } },
                        client: { select: { id: true, name: true } },
                    },
                },
                postedBy: { select: { id: true, name: true } },
            },
            orderBy: { date: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        const periodTotals = await this.prisma.journalLine.aggregate({
            where: {
                accountId: id,
                journal: {
                    status: 'POSTED',
                    ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
                }
            },
            _sum: {
                debit: true,
                credit: true,
            },
        });
        const periodDebit = periodTotals._sum?.debit || 0;
        const periodCredit = periodTotals._sum?.credit || 0;
        let periodBalance = 0;
        if (account.nature === 'DEBIT') {
            periodBalance = periodDebit - periodCredit;
        }
        else {
            periodBalance = periodCredit - periodDebit;
        }
        const formattedJournals = journals.map((j) => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: luxon_1.DateTime.fromJSDate(j.date)
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-LL-dd HH:mm:ss'),
            hijriDate: this.toHijri(j.date),
            status: j.status,
            type: j.type,
            postedBy: j.postedBy?.name ?? null,
            lines: j.lines.map((l) => ({
                id: l.id,
                description: l.description,
                debit: l.debit,
                credit: l.credit,
                balance: l.balance,
                client: l.client ? { id: l.client.id, name: l.client.name } : null,
                account: l.account,
            })),
        }));
        return {
            totalPages: Math.ceil(totalJournals / limit),
            currentPage: page,
            limit,
            account: {
                ...account,
                balance: periodBalance,
                debit: periodDebit,
                credit: periodCredit,
            },
            totalJournals,
            journals: formattedJournals,
            periodSummary: {
                debit: periodDebit,
                credit: periodCredit,
                balance: periodBalance,
            },
        };
    }
    async getAccountsTree() {
        const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
        const map = new Map();
        const roots = [];
        accounts.forEach(acc => {
            map.set(acc.id, { ...acc, children: [] });
        });
        accounts.forEach(acc => {
            if (acc.parentId) {
                map.get(acc.parentId).children.push(map.get(acc.id));
            }
            else {
                roots.push(map.get(acc.id));
            }
        });
        return roots;
    }
    async getBankAccountReport(month, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        let monthStart;
        let monthEnd;
        if (month) {
            const [year, monthNum] = month.split("-").map(Number);
            monthStart = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: "Asia/Riyadh" }).startOf("day").toUTC().toJSDate();
            monthEnd = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: "Asia/Riyadh" }).endOf("month").endOf("day").toUTC().toJSDate();
        }
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
            include: {
                entries: {
                    where: {
                        journal: {
                            status: "POSTED",
                            ...(monthStart &&
                                monthEnd && { date: { gte: monthStart, lte: monthEnd } }),
                        },
                    },
                    include: {
                        journal: {
                            include: {
                                postedBy: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                        client: { select: { id: true, name: true } },
                    },
                    orderBy: { id: "desc" },
                    skip,
                    take: limit,
                },
            },
        });
        if (!bankAccount)
            throw new common_1.NotFoundException("Bank account 11000 not found");
        const totalJournals = await this.prisma.journalLine.count({
            where: {
                accountId: bankAccount.id,
                journal: {
                    status: "POSTED",
                    ...(monthStart &&
                        monthEnd && { date: { gte: monthStart, lte: monthEnd } }),
                },
            },
        });
        const totalPages = Math.ceil(totalJournals / limit);
        const loansAccount = await this.prisma.account.findUnique({
            where: { code: "12000" },
        });
        if (!loansAccount)
            throw new common_1.NotFoundException("Loans account 12000 not found");
        const groupedByMonth = bankAccount.entries.reduce((acc, line) => {
            const date = luxon_1.DateTime.fromJSDate(line.journal.date).setZone("Asia/Riyadh");
            const monthKey = date.toFormat("yyyy-LL");
            if (!acc[monthKey]) {
                acc[monthKey] = {
                    entries: [],
                    totalDebit: 0,
                    totalCredit: 0,
                    totalBalance: 0,
                };
            }
            acc[monthKey].entries.push({
                id: line.journal.id,
                date: date.toISO(),
                reference: line.journal.reference,
                description: line.description ?? line.journal.description,
                debit: line.debit,
                credit: line.credit,
                balance: line.balance,
                client: line.client ? line.client.name : null,
                postedBy: line.journal.postedBy?.name ?? null,
                status: line.journal.status,
                type: line.journal.type,
            });
            acc[monthKey].totalDebit += line.debit ?? 0;
            acc[monthKey].totalCredit += line.credit ?? 0;
            acc[monthKey].totalBalance += line.balance ?? 0;
            return acc;
        }, {});
        const repaymentFilter = {};
        if (monthStart && monthEnd) {
            repaymentFilter.dueDate = {
                gte: monthStart,
                lte: monthEnd,
            };
        }
        const now = luxon_1.DateTime.now().setZone("Asia/Riyadh");
        const currentMonthStart = now.startOf("month").toUTC().toJSDate();
        const currentMonthEnd = now.endOf("month").endOf("day").toUTC().toJSDate();
        const currentMonthRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: {
                    gte: currentMonthStart,
                    lte: currentMonthEnd,
                },
            },
            select: {
                amount: true,
                paidAmount: true,
            },
        });
        const currentMonthTotalAmount = currentMonthRepayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const currentMonthPaidUntilNow = currentMonthRepayments.reduce((sum, x) => sum + Number(x.paidAmount), 0);
        const repayments = await this.prisma.repayment.findMany({
            where: repaymentFilter,
            select: {
                amount: true,
                paidAmount: true,
            },
        });
        const totalAmount = repayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const paidUntilNow = repayments.reduce((sum, x) => sum + Number(x.paidAmount), 0);
        return {
            pagination: {
                page,
                limit,
                totalJournals,
                totalPages,
            },
            account: {
                id: bankAccount.id,
                name: bankAccount.name,
                code: bankAccount.code,
                debit: bankAccount.debit,
                credit: bankAccount.credit,
                balance: bankAccount.balance,
            },
            loansBalance: loansAccount.balance,
            total: bankAccount.balance + loansAccount.balance,
            totalJournalEntries: totalJournals,
            journalsByMonth: groupedByMonth,
            repayments: {
                totalAmount,
                paidUntilNow,
            },
            currentMonth: {
                totalAmount: currentMonthTotalAmount,
                paidUntilNow: currentMonthPaidUntilNow,
            },
        };
    }
    async getNEWBankAccountReport(month, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        let monthStart;
        let monthEnd;
        if (month) {
            const [year, monthNum] = month.split("-").map(Number);
            monthStart = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: "Asia/Riyadh" }).startOf("day").toUTC().toJSDate();
            monthEnd = luxon_1.DateTime.fromObject({ year, month: monthNum, day: 1 }, { zone: "Asia/Riyadh" }).endOf("month").endOf("day").toUTC().toJSDate();
        }
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: "11001" },
            include: {
                entries: {
                    where: {
                        journal: {
                            status: "POSTED",
                            ...(monthStart &&
                                monthEnd && { date: { gte: monthStart, lte: monthEnd } }),
                        },
                    },
                    include: {
                        journal: {
                            include: {
                                postedBy: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                        client: { select: { id: true, name: true } },
                    },
                    orderBy: { id: "desc" },
                    skip,
                    take: limit,
                },
            },
        });
        if (!bankAccount)
            throw new common_1.NotFoundException("Bank account 11001 not found");
        const totalJournals = await this.prisma.journalLine.count({
            where: {
                accountId: bankAccount.id,
                journal: {
                    status: "POSTED",
                    ...(monthStart &&
                        monthEnd && { date: { gte: monthStart, lte: monthEnd } }),
                },
            },
        });
        const totalPages = Math.ceil(totalJournals / limit);
        const loansAccount = await this.prisma.account.findUnique({
            where: { code: "12000" },
        });
        if (!loansAccount)
            throw new common_1.NotFoundException("Loans account 12000 not found");
        const groupedByMonth = bankAccount.entries.reduce((acc, line) => {
            const date = luxon_1.DateTime.fromJSDate(line.journal.date).setZone("Asia/Riyadh");
            const monthKey = date.toFormat("yyyy-LL");
            if (!acc[monthKey]) {
                acc[monthKey] = {
                    entries: [],
                    totalDebit: 0,
                    totalCredit: 0,
                    totalBalance: 0,
                };
            }
            acc[monthKey].entries.push({
                id: line.journal.id,
                date: date.toISO(),
                reference: line.journal.reference,
                description: line.description ?? line.journal.description,
                debit: line.debit,
                credit: line.credit,
                balance: line.balance,
                client: line.client ? line.client.name : null,
                postedBy: line.journal.postedBy?.name ?? null,
                status: line.journal.status,
                type: line.journal.type,
            });
            acc[monthKey].totalDebit += line.debit ?? 0;
            acc[monthKey].totalCredit += line.credit ?? 0;
            acc[monthKey].totalBalance += line.balance ?? 0;
            return acc;
        }, {});
        const repaymentFilter = {};
        if (monthStart && monthEnd) {
            repaymentFilter.dueDate = {
                gte: monthStart,
                lte: monthEnd,
            };
            repaymentFilter.loan = { source: "NEW_CAPITAL" };
        }
        const now = luxon_1.DateTime.now().setZone("Asia/Riyadh");
        const currentMonthStart = now.startOf("month").toUTC().toJSDate();
        const currentMonthEnd = now.endOf("month").endOf("day").toUTC().toJSDate();
        const currentMonthRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: {
                    gte: currentMonthStart,
                    lte: currentMonthEnd,
                },
                loan: { source: "NEW_CAPITAL" }
            },
            select: {
                amount: true,
                paidAmount: true,
            },
        });
        const currentMonthTotalAmount = currentMonthRepayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const currentMonthPaidUntilNow = currentMonthRepayments.reduce((sum, x) => sum + Number(x.paidAmount), 0);
        const repayments = await this.prisma.repayment.findMany({
            where: repaymentFilter,
            select: {
                amount: true,
                paidAmount: true,
            },
        });
        const totalAmount = repayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const paidUntilNow = repayments.reduce((sum, x) => sum + Number(x.paidAmount), 0);
        return {
            pagination: {
                page,
                limit,
                totalJournals,
                totalPages,
            },
            account: {
                id: bankAccount.id,
                name: bankAccount.name,
                code: bankAccount.code,
                debit: bankAccount.debit,
                credit: bankAccount.credit,
                balance: bankAccount.balance,
            },
            total: bankAccount.balance,
            totalJournalEntries: totalJournals,
            journalsByMonth: groupedByMonth,
            repayments: {
                totalAmount,
                paidUntilNow,
            },
            currentMonth: {
                totalAmount: currentMonthTotalAmount,
                paidUntilNow: currentMonthPaidUntilNow,
            },
        };
    }
};
exports.AccountsService = AccountsService;
exports.AccountsService = AccountsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AccountsService);
//# sourceMappingURL=accounts.service.js.map