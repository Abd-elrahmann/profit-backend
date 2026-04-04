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

    async createAccount(dto: CreateAccountDto) {
        if (dto.parentId) {
            const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
            if (!parent) throw new NotFoundException('Parent account not found');
        }

        const exists = await this.prisma.account.findUnique({ where: { code: dto.code } });
        if (exists) throw new BadRequestException('رمز الحساب موجود بالفعل');

        const accountData: any = { ...dto };

        if (dto.amount) {
            if (dto.nature === 'DEBIT') {
                accountData.debit = dto.amount;
                accountData.credit = 0;
                accountData.balance = dto.amount;
            } else if (dto.nature === 'CREDIT') {
                accountData.credit = dto.amount;
                accountData.debit = 0;
                accountData.balance = dto.amount;
            }

            // Add amount to parent account if parentId exists
            if (dto.parentId) {
                const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
                if (parent) {
                    let newDebit = parent.debit || 0;
                    let newCredit = parent.credit || 0;

                    if (dto.nature === 'DEBIT') {
                        newDebit = Number(newDebit) + dto.amount;
                    } else if (dto.nature === 'CREDIT') {
                        newCredit = Number(newCredit) + dto.amount;
                    }

                    let newBalance = 0;
                    if (parent.nature === 'DEBIT') {
                        newBalance = newDebit - newCredit;
                    } else {
                        newBalance = newCredit - newDebit;
                    }

                    await this.prisma.account.update({
                        where: { id: dto.parentId },
                        data: {
                            debit: newDebit,
                            credit: newCredit,
                            balance: newBalance,
                        },
                    });
                }
            }

            delete accountData.amount;
        }

        const account = await this.prisma.account.create({ data: accountData });
        this.accountsTreeCache = null;
        return { message: 'تم انشاء الحساب بنجاح', account };
    }

    async updateAccount(id: number, dto: UpdateAccountDto) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const updateData: any = { ...dto };

        if (dto.amount !== undefined) {
            const nature = dto.nature || account.nature;
            
            // Calculate old amount based on account nature
            const oldAmount = account.nature === 'DEBIT' ? (account.debit || 0) : (account.credit || 0);
            const amountDifference = dto.amount - oldAmount;

            if (nature === 'DEBIT') {
                updateData.debit = dto.amount;
                updateData.credit = 0;
                updateData.balance = dto.amount;
            } else if (nature === 'CREDIT') {
                updateData.credit = dto.amount;
                updateData.debit = 0;
                updateData.balance = dto.amount;
            }

            // Update parent account if it exists
            if (account.parentId && amountDifference !== 0) {
                const parent = await this.prisma.account.findUnique({ where: { id: account.parentId } });
                if (parent) {
                    let newDebit = parent.debit || 0;
                    let newCredit = parent.credit || 0;

                    if (nature === 'DEBIT') {
                        newDebit = Number(newDebit) + amountDifference;
                    } else if (nature === 'CREDIT') {
                        newCredit = Number(newCredit) + amountDifference;
                    }

                    let newBalance = 0;
                    if (parent.nature === 'DEBIT') {
                        newBalance = newDebit - newCredit;
                    } else {
                        newBalance = newCredit - newDebit;
                    }

                    await this.prisma.account.update({
                        where: { id: account.parentId },
                        data: {
                            debit: newDebit,
                            credit: newCredit,
                            balance: newBalance,
                        },
                    });
                }
            }

            delete updateData.amount;
        }

        const updated = await this.prisma.account.update({
            where: { id },
            data: updateData,
        });

        this.accountsTreeCache = null;
        return { message: 'تم تعديل الحساب بنجاح', account: updated };
    }

    async deleteAccount(id: number) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const hasChildren = await this.prisma.account.findFirst({ where: { parentId: id } });
        if (hasChildren) throw new BadRequestException('لا يمكن حذف حساب لديه حسابات فرعية');

        // Update parent account if it exists
        if (account.parentId) {
            const parent = await this.prisma.account.findUnique({ where: { id: account.parentId } });
            if (parent) {
                let newDebit = parent.debit || 0;
                let newCredit = parent.credit || 0;

                // Subtract the deleted account's amount from parent
                if (account.nature === 'DEBIT') {
                    newDebit = Number(newDebit) - (account.debit || 0);
                } else if (account.nature === 'CREDIT') {
                    newCredit = Number(newCredit) - (account.credit || 0);
                }

                let newBalance = 0;
                if (parent.nature === 'DEBIT') {
                    newBalance = newDebit - newCredit;
                } else {
                    newBalance = newCredit - newDebit;
                }

                await this.prisma.account.update({
                    where: { id: account.parentId },
                    data: {
                        debit: newDebit,
                        credit: newCredit,
                        balance: newBalance,
                    },
                });
            }
        }

        await this.prisma.account.delete({ where: { id } });
        this.accountsTreeCache = null;
        return { message: 'تم حذف الحساب بنجاح' };
    }

    async getAllAccounts(page: number = 1, limit: number = 10, filters?: any) {
        const where: any = {};


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

    async getAccountDetails(id: number) {
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account) throw new NotFoundException('Account not found');

        return account;
    }

    async getAccountById(
        id: number,
        page = 1,
        options: { from?: string; to?: string; limit?: number } = {}
    ) {
        const { from, to, limit = 10 } = options;


        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account) throw new NotFoundException('Account not found');


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
        } else {
            periodBalance = periodCredit - periodDebit;
        }


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

    private accountsTreeCache: { data: any[]; expiresAt: number } | null = null;

    async getAccountsTree() {
        const now = Date.now();
        if (this.accountsTreeCache && this.accountsTreeCache.expiresAt > now) {
            return this.accountsTreeCache.data;
        }

        const accounts = await this.prisma.account.findMany({
            orderBy: { code: 'asc' },
            select: {
                id: true,
                code: true,
                name: true,
                parentId: true,
                nature: true,
                debit: true,
                credit: true,
                balance: true,
            },
        });

        const map = new Map<number, any>();
        const roots: any[] = [];

        accounts.forEach((acc) => {
            map.set(acc.id, { ...acc, children: [] });
        });

        accounts.forEach((acc) => {
            if (acc.parentId) {
                const parent = map.get(acc.parentId);
                if (parent) parent.children.push(map.get(acc.id));
            } else {
                roots.push(map.get(acc.id));
            }
        });

        this.accountsTreeCache = {
            data: roots,
            expiresAt: now + 5 * 60 * 1000,
        };

        return roots;
    }

    async getBankAccountReport(month?: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        let monthStart: Date | undefined;
        let monthEnd: Date | undefined;

        if (month) {
            const parts = month.split("-").map(Number);

            if (parts.length === 1) {
                const [year] = parts;

                monthStart = DateTime.fromObject(
                    { year, month: 1, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).startOf("day").toUTC().toJSDate();

                monthEnd = DateTime.fromObject(
                    { year, month: 12, day: 31 },
                    { zone: "Asia/Riyadh" }
                ).endOf("day").toUTC().toJSDate();
            } else {
                const [year, monthNum] = parts;

                monthStart = DateTime.fromObject(
                    { year, month: monthNum, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).startOf("day").toUTC().toJSDate();

                monthEnd = DateTime.fromObject(
                    { year, month: monthNum, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).endOf("month").endOf("day").toUTC().toJSDate();
            }
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
        repaymentFilter.loan = { status: "ACTIVE" };

        const now = DateTime.now().setZone("Asia/Riyadh");

        const currentMonthStart = now.startOf("month").toUTC().toJSDate();
        const currentMonthEnd = now.endOf("month").endOf("day").toUTC().toJSDate();

        const currentMonthRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: {
                    gte: currentMonthStart,
                    lte: currentMonthEnd,
                },
                loan: {
                    status: 'ACTIVE',
                },

            },
            select: {
                amount: true,
                paidAmount: true,
                remaining: true,
                discount: true,
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

        const currentMonthremaining = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.remaining),
            0
        );

        const currentMonthdiscount = currentMonthRepayments.reduce(
            (sum, x) => sum + Number(x.discount),
            0
        );


        const repayments = await this.prisma.repayment.findMany({
            where: repaymentFilter,
            select: {
                amount: true,
                paidAmount: true,
                remaining: true,
                discount: true,
            },
        });

        const totalAmount = repayments.reduce((sum, x) => sum + Number(x.amount), 0);
        const paidUntilNow = repayments.reduce((sum, x) => sum + Number(x.paidAmount), 0);
        const remaining = repayments.reduce((sum, x) => sum + Number(x.remaining), 0);
        const discount = repayments.reduce((sum, x) => sum + Number(x.discount), 0);

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
                remaining,
                discount,
            },
            currentMonth: {
                totalAmount: currentMonthTotalAmount,
                paidUntilNow: currentMonthPaidUntilNow,
                remaining: currentMonthremaining,
                discount: currentMonthdiscount,
            },
        };
    }

    async getNEWBankAccountReport(month?: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        let monthStart: Date | undefined;
        let monthEnd: Date | undefined;

        if (month) {
            const parts = month.split("-").map(Number);

            if (parts.length === 1) {
                const [year] = parts;

                monthStart = DateTime.fromObject(
                    { year, month: 1, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).startOf("day").toUTC().toJSDate();

                monthEnd = DateTime.fromObject(
                    { year, month: 12, day: 31 },
                    { zone: "Asia/Riyadh" }
                ).endOf("day").toUTC().toJSDate();
            } else {
                const [year, monthNum] = parts;

                monthStart = DateTime.fromObject(
                    { year, month: monthNum, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).startOf("day").toUTC().toJSDate();

                monthEnd = DateTime.fromObject(
                    { year, month: monthNum, day: 1 },
                    { zone: "Asia/Riyadh" }
                ).endOf("month").endOf("day").toUTC().toJSDate();
            }
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
        repaymentFilter.loan = { source: "NEW_CAPITAL" };

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