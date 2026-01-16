import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';
import { DateTime } from 'luxon';
import moment from "moment-hijri";

@Injectable()
export class AccountsService {
    constructor(private readonly prisma: PrismaService) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    // CREATE ACCOUNT
    async createAccount(dto: CreateAccountDto) {
        if (dto.parentId) {
            const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
            if (!parent) throw new NotFoundException('Parent account not found');
        }

        const exists = await this.prisma.account.findUnique({ where: { code: dto.code } });
        if (exists) throw new BadRequestException('رمز الحساب موجود بالفعل');

        const account = await this.prisma.account.create({ data: dto });
        return { message: 'تم انشاء الحساب بنجاح', account };
    }

    // UPDATE ACCOUNT
    async updateAccount(id: number, dto: UpdateAccountDto) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const updated = await this.prisma.account.update({
            where: { id },
            data: dto,
        });

        return { message: 'تم تعديل الحساب بنجاح', account: updated };
    }

    // DELETE ACCOUNT
    async deleteAccount(id: number) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const hasChildren = await this.prisma.account.findFirst({ where: { parentId: id } });
        if (hasChildren) throw new BadRequestException('لا يمكن حذف حساب لديه حسابات فرعية');

        await this.prisma.account.delete({ where: { id } });
        return { message: 'تم حذف الحساب بنجاح' };
    }

    // GET ALL ACCOUNTS
    async getAllAccounts(page: number = 1, limit: number = 10, filters?: any) {
        const where: any = {};

        // Search filter (by name or code)
        if (filters?.search) {
            const search = filters.search.trim();
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Query paginated accounts
        const accounts = await this.prisma.account.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { code: 'asc' },
        });

        // Total count for pagination
        const total = await this.prisma.account.count({ where });

        return {
            total,
            page,
            limit,
            accounts,
        };
    }

    // GET ACCOUNT DETAILS (without journals)
    async getAccountDetails(id: number) {
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account) throw new NotFoundException('Account not found');

        return account;
    }

    // GET ACCOUNT BY ID
    async getAccountById(
        id: number,
        page = 1,
        options: { from?: string; to?: string; limit?: number } = {}
    ) {
        const { from, to, limit = 10 } = options;

        // Step 1: Get the account with children
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account) throw new NotFoundException('Account not found');

        // Step 2: Build date filter (Saudi timezone)
        const dateFilter: any = {};
        if (from) {
            const saudiFrom = DateTime.fromISO(from, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toJSDate();
            dateFilter.gte = saudiFrom;
        }
        if (to) {
            const saudiTo = DateTime.fromISO(to, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toJSDate();
            dateFilter.lte = saudiTo;
        }

        // Step 3: Count total matching journals
        const totalJournals = await this.prisma.journalHeader.count({
            where: {
                status: 'POSTED',
                lines: { some: { accountId: id } },
                ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
            },
        });

        // Step 4: Fetch journals with pagination
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

        // Step 5: Calculate period-specific totals
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

        // Calculate period balance based on account nature
        let periodBalance = 0;
        if (account.nature === 'DEBIT') {
            periodBalance = periodDebit - periodCredit;
        } else {
            periodBalance = periodCredit - periodDebit;
        }

        // Step 6: Format response
        const formattedJournals = journals.map((j) => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: DateTime.fromJSDate(j.date)
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

        // Step 7: Return result with period-specific balances
        return {
            totalPages: Math.ceil(totalJournals / limit),
            currentPage: page,
            limit,
            account: {
                ...account,
                // Override the overall balance with period-specific balance
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

    // GET ACCOUNTS TREE
    async getAccountsTree() {
        const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });

        const map = new Map<number, any>();
        const roots: any[] = [];

        accounts.forEach(acc => {
            map.set(acc.id, { ...acc, children: [] });
        });

        accounts.forEach(acc => {
            if (acc.parentId) {
                map.get(acc.parentId).children.push(map.get(acc.id));
            } else {
                roots.push(map.get(acc.id));
            }
        });

        return roots;
    }

    // GET BANK ACCOUNT WITH ALL JOURNALS AND REPAYMENTS
    async getBankAccountReport(month?: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        let monthStart: Date | undefined;
        let monthEnd: Date | undefined;

        if (month) {
            const [year, monthNum] = month.split("-").map(Number);

            monthStart = DateTime.fromObject(
                { year, month: monthNum, day: 1 },
                { zone: "Asia/Riyadh" }
            ).startOf("day").toUTC().toJSDate();

            monthEnd = DateTime.fromObject(
                { year, month: monthNum, day: 1 },
                { zone: "Asia/Riyadh" }
            ).endOf("month").endOf("day").toUTC().toJSDate();
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
            throw new NotFoundException("Bank account 11000 not found");

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
            throw new NotFoundException("Loans account 12000 not found");

        const interestAgg = await this.prisma.partnerShareAccrual.aggregate({
            _sum: {
                companyCut: true,
                partnerFinal: true,
                cents: true,
            },
            where: monthStart && monthEnd ? {
                createdAt: {
                    gte: monthStart,
                    lte: monthEnd,
                },
            } : undefined,
        });

        const totalInterest =
            Number(interestAgg._sum.partnerFinal || 0) +
            Number(interestAgg._sum.companyCut || 0) +
            Number(interestAgg._sum.cents || 0);

        const groupedByMonth = bankAccount.entries.reduce(
            (acc, line) => {
                const date = DateTime.fromJSDate(line.journal.date).setZone("Asia/Riyadh");
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
            },
            {} as Record<
                string,
                { entries: any[]; totalDebit: number; totalCredit: number; totalBalance: number }
            >
        );

        const repaymentFilter: any = {};
        if (monthStart && monthEnd) {
            repaymentFilter.dueDate = {
                gte: monthStart,
                lte: monthEnd,
            };
        }

        const now = DateTime.now().setZone("Asia/Riyadh");

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

        const currentMonthTotalAmount = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.amount),
            0
        );

        const currentMonthPaidUntilNow = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.paidAmount),
            0
        );


        const repayments = await this.prisma.repayment.findMany({
            where: repaymentFilter,
            select: {
                amount: true,
                paidAmount: true,
            },
        });

        const totalAmount = repayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const paidUntilNow = repayments.reduce(
            (sum, x) => sum + Number(x.paidAmount),
            0
        );

        const loansWithInterest =
            Number(loansAccount.balance || 0) + totalInterest;

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
            loansInterest: totalInterest,
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

    // GET BANK ACCOUNT WITH ALL JOURNALS AND REPAYMENTS
    async getNEWBankAccountReport(month?: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        let monthStart: Date | undefined;
        let monthEnd: Date | undefined;

        if (month) {
            const [year, monthNum] = month.split("-").map(Number);

            monthStart = DateTime.fromObject(
                { year, month: monthNum, day: 1 },
                { zone: "Asia/Riyadh" }
            ).startOf("day").toUTC().toJSDate();

            monthEnd = DateTime.fromObject(
                { year, month: monthNum, day: 1 },
                { zone: "Asia/Riyadh" }
            ).endOf("month").endOf("day").toUTC().toJSDate();
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
            throw new NotFoundException("Bank account 11001 not found");

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
            throw new NotFoundException("Loans account 12000 not found");

        const groupedByMonth = bankAccount.entries.reduce(
            (acc, line) => {
                const date = DateTime.fromJSDate(line.journal.date).setZone("Asia/Riyadh");
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
            },
            {} as Record<
                string,
                { entries: any[]; totalDebit: number; totalCredit: number; totalBalance: number }
            >
        );

        const repaymentFilter: any = {};
        if (monthStart && monthEnd) {
            repaymentFilter.dueDate = {
                gte: monthStart,
                lte: monthEnd,
            };

            repaymentFilter.loan = { source: "NEW_CAPITAL" }
        }

        const now = DateTime.now().setZone("Asia/Riyadh");

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

        const currentMonthTotalAmount = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.amount),
            0
        );

        const currentMonthPaidUntilNow = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.paidAmount),
            0
        );

        const repayments = await this.prisma.repayment.findMany({
            where: repaymentFilter,
            select: {
                amount: true,
                paidAmount: true,
            },
        });

        const totalAmount = repayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const paidUntilNow = repayments.reduce(
            (sum, x) => sum + Number(x.paidAmount),
            0
        );

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
}