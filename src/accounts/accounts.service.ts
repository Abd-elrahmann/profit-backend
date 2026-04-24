import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';
import { DateTime } from 'luxon';
import moment from "moment-hijri";
import { AccountBasicType, JournalSourceType, JournalType } from '@prisma/client';

@Injectable()
export class AccountsService {
    constructor(private readonly prisma: PrismaService) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    private getJournalTypeArabic(type?: JournalType | null) {
        switch (type) {
            case JournalType.OPENING:
                return 'قيد افتتاحي';
            case JournalType.CLOSING:
                return 'قيد إقفال';
            case JournalType.ADJUSTMENT:
                return 'قيد تسوية';
            case JournalType.GENERAL:
            default:
                return 'قيد عام';
        }
    }

    private getJournalSourceArabic(sourceType?: JournalSourceType | null) {
        switch (sourceType) {
            case JournalSourceType.LOAN:
                return 'عملية سلفة';
            case JournalSourceType.REPAYMENT:
                return 'عملية سداد';
            case JournalSourceType.PARTNER:
                return 'عملية مساهم';
            case JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL:
                return 'سحب مساهم';
            case JournalSourceType.PARTNER_TRANSACTION_DEPOSIT:
                return 'إيداع مساهم';
            case JournalSourceType.PARTNER_PROFIT_WITHDRAWAL:
                return 'سحب أرباح مساهم';
            case JournalSourceType.PARTNER_SAVING_WITHDRAWAL:
                return 'سحب مدخرات مساهم';
            case JournalSourceType.PERIOD_CLOSING:
                return 'إقفال فترة';
            case JournalSourceType.ZAKAT:
                return 'عملية زكاة';
            case JournalSourceType.SAVING:
                return 'عملية ادخار';
            case JournalSourceType.COMPANY_PROFIT_WITHDRAWAL:
                return 'سحب أرباح الشركة';
            case JournalSourceType.EXPENSES:
                return 'مصروف';
            case JournalSourceType.LOSSES:
                return 'إثبات خسارة';
            case JournalSourceType.PARTNER_WITHDRAWING:
                return 'سحب من حساب مساهم';
            case JournalSourceType.SMALL_LOAN:
                return 'سلفة صغيرة';
            case JournalSourceType.LOAN_CONVERSION:
                return 'تحويل سلفة';
            case JournalSourceType.LOAN_INTEREST:
                return 'فائدة سلفة';
            case JournalSourceType.CLIENT:
                return 'عملية عميل';
            case JournalSourceType.EXTERNAL_PROFIT:
                return 'أرباح استثمار خارجي';
            case JournalSourceType.OTHER:
            default:
                return null;
        }
    }

    private resolveJournalDescription(params: {
        lineDescription?: string | null;
        journalDescription?: string | null;
        journalReference?: string | null;
        journalType?: JournalType | null;
        sourceType?: JournalSourceType | null;
        clientName?: string | null;
        partnerName?: string | null;
    }) {
        const {
            lineDescription,
            journalDescription,
            journalReference,
            journalType,
            sourceType,
            clientName,
            partnerName,
        } = params;
        const lineText = lineDescription?.trim();
        const journalText = journalDescription?.trim();
        const sourceText = this.getJournalSourceArabic(sourceType);
        const typeText = this.getJournalTypeArabic(journalType);

        const relationParts: string[] = [];
        const clientText = clientName?.trim();
        if (clientText) relationParts.push(`العميل: ${clientText}`);
        const partnerText = partnerName?.trim();
        if (partnerText) relationParts.push(`المساهم: ${partnerText}`);

        const relationSuffix = relationParts.length ? ` (${relationParts.join(' - ')})` : '';
        const operationBase = sourceText || typeText;

        if (lineText) return `${operationBase}: ${lineText}${relationSuffix}`;
        if (journalText) return `${operationBase}: ${journalText}${relationSuffix}`;

        const referenceText = journalReference?.trim();
        if (referenceText) return `${operationBase}: قيد رقم ${referenceText}${relationSuffix}`;

        return `${operationBase}${relationSuffix}`;
    }

    private async getPartnerNamesByJournalSources(
        sources: Array<{ sourceType?: JournalSourceType | null; sourceId?: number | null }>,
    ) {
        const partnerIds = Array.from(
            new Set(
                sources
                    .filter(
                        (s) =>
                            s.sourceType === JournalSourceType.PARTNER &&
                            typeof s.sourceId === 'number',
                    )
                    .map((s) => Number(s.sourceId)),
            ),
        );

        if (partnerIds.length === 0) return new Map<number, string>();

        const partners = await this.prisma.partner.findMany({
            where: { id: { in: partnerIds } },
            select: { id: true, name: true },
        });

        return new Map<number, string>(partners.map((p) => [p.id, p.name]));
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
        const partnerNamesById = await this.getPartnerNamesByJournalSources(
            journals.map((j) => ({ sourceType: j.sourceType, sourceId: j.sourceId })),
        );


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
                    description: this.resolveJournalDescription({
                        lineDescription: l.description,
                        journalDescription: j.description,
                        journalReference: j.reference,
                        journalType: j.type,
                        sourceType: j.sourceType,
                        clientName: l.client?.name ?? null,
                        partnerName:
                            j.sourceType === JournalSourceType.PARTNER && j.sourceId
                                ? partnerNamesById.get(j.sourceId) ?? null
                                : null,
                    }),
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

    /**
     * بحث في دليل الحسابات: أي حساب يطابق الاسم/الكود يُعرض مع جميع أبنائه (وأحفادِه) في الشجرة.
     */
    async searchAccountsTree(q: string) {
        const search = (q ?? '').trim();
        if (!search) {
            return this.getAccountsTree();
        }

        const allAccounts = await this.prisma.account.findMany({
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

        const lower = search.toLowerCase();
        const matchesRow = (a: (typeof allAccounts)[number]) =>
            (a.code && a.code.toLowerCase().includes(lower)) ||
            (a.name && a.name.toLowerCase().includes(lower));

        const childrenByParent = new Map<number, number[]>();
        for (const a of allAccounts) {
            if (a.parentId != null) {
                if (!childrenByParent.has(a.parentId)) {
                    childrenByParent.set(a.parentId, []);
                }
                childrenByParent.get(a.parentId)!.push(a.id);
            }
        }

        const included = new Set<number>();
        const queue: number[] = [];
        for (const a of allAccounts) {
            if (matchesRow(a)) {
                included.add(a.id);
                queue.push(a.id);
            }
        }

        while (queue.length > 0) {
            const id = queue.shift()!;
            for (const kid of childrenByParent.get(id) ?? []) {
                if (!included.has(kid)) {
                    included.add(kid);
                    queue.push(kid);
                }
            }
        }

        const filtered = allAccounts.filter((a) => included.has(a.id));
        const map = new Map<number, any>();
        for (const acc of filtered) {
            map.set(acc.id, { ...acc, children: [] });
        }
        const roots: any[] = [];
        for (const acc of filtered) {
            const node = map.get(acc.id)!;
            if (acc.parentId != null && map.has(acc.parentId)) {
                map.get(acc.parentId)!.children.push(node);
            } else {
                roots.push(node);
            }
        }
        const sortRecursive = (nodes: any[]) => {
            nodes.sort((a, b) =>
                String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
            );
            for (const n of nodes) {
                if (n.children?.length) sortRecursive(n.children);
            }
        };
        sortRecursive(roots);
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

        const parentBankAccount = await this.prisma.account.findUnique({
            where: { code: "11000" },
        });

        if (!parentBankAccount)
            throw new NotFoundException("Bank account 11000 not found");

        // Get all child accounts of 11000
        const childAccounts = await this.prisma.account.findMany({
            where: { parentId: parentBankAccount.id },
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
        const partnerNamesById = await this.getPartnerNamesByJournalSources(
            childAccounts.flatMap((account) =>
                account.entries.map((line) => ({
                    sourceType: line.journal.sourceType,
                    sourceId: line.journal.sourceId,
                })),
            ),
        );

        // Calculate total journals across all child accounts
        const totalJournals = await this.prisma.journalLine.count({
            where: {
                accountId: { in: childAccounts.map(a => a.id) },
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

        // Organize entries by child account and month
        const accountsByChild: Record<string, any> = {};

        childAccounts.forEach(account => {
            accountsByChild[account.id] = {
                accountId: account.id,
                accountCode: account.code,
                accountName: account.name,
                debit: account.debit,
                credit: account.credit,
                balance: account.balance,
                journalsByMonth: account.entries.reduce(
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
                            description: this.resolveJournalDescription({
                                lineDescription: line.description,
                                journalDescription: line.journal.description,
                                journalReference: line.journal.reference,
                                journalType: line.journal.type,
                                sourceType: line.journal.sourceType,
                                clientName: line.client?.name ?? null,
                                partnerName:
                                    line.journal.sourceType === JournalSourceType.PARTNER &&
                                        line.journal.sourceId
                                        ? partnerNamesById.get(line.journal.sourceId) ?? null
                                        : null,
                            }),
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
                ),
            };
        });

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

        // Calculate totals for all child accounts
        const totalDebit = childAccounts.reduce((sum, acc) => sum + (acc.debit || 0), 0);
        const totalCredit = childAccounts.reduce((sum, acc) => sum + (acc.credit || 0), 0);
        const totalBalance = childAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

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
                id: parentBankAccount.id,
                name: parentBankAccount.name,
                code: parentBankAccount.code,
                debit: totalDebit,
                credit: totalCredit,
                balance: totalBalance,
            },
            childAccounts: Object.values(accountsByChild),
            loansBalance: loansAccount.balance,
            loansInterest: totalInterest,
            total: totalBalance + loansAccount.balance,

            totalJournalEntries: totalJournals,
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

    async getNEWBankAccountReport(
        month?: string,
        page: number = 1,
        limit: number = 20,
        accountId?: number,
    ) {
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
            where: accountId ? { id: accountId } : { code: "11001" },
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
        const partnerNamesById = await this.getPartnerNamesByJournalSources(
            bankAccount?.entries?.map((line) => ({
                sourceType: line.journal.sourceType,
                sourceId: line.journal.sourceId,
            })) ?? [],
        );

        if (!bankAccount) {
            throw new NotFoundException(
                accountId
                    ? `Bank account ${accountId} not found`
                    : "Bank account 11001 not found",
            );
        }

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
                    description: this.resolveJournalDescription({
                        lineDescription: line.description,
                        journalDescription: line.journal.description,
                        journalReference: line.journal.reference,
                        journalType: line.journal.type,
                        sourceType: line.journal.sourceType,
                        clientName: line.client?.name ?? null,
                        partnerName:
                            line.journal.sourceType === JournalSourceType.PARTNER &&
                                line.journal.sourceId
                                ? partnerNamesById.get(line.journal.sourceId) ?? null
                                : null,
                    }),
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

    async getTrialBalance(options: {
        from?: string;
        to?: string;
        accountId?: number;
        accountBasicType?: AccountBasicType;
    }) {
        const { from, to, accountId, accountBasicType } = options;

        const dateFilter: any = {};

        if (from) {
            dateFilter.gte = DateTime.fromISO(from, { zone: 'Asia/Riyadh' })
                .startOf('day')
                .toJSDate();
        }

        if (to) {
            dateFilter.lte = DateTime.fromISO(to, { zone: 'Asia/Riyadh' })
                .endOf('day')
                .toJSDate();
        }

        const accounts = await this.prisma.account.findMany({
            where: {
                ...(accountId && { id: accountId }),
                ...(accountBasicType && { accountBasicType }),
            },
            select: {
                id: true,
                name: true,
                code: true,
                nature: true,
                accountBasicType: true,
            },
            orderBy: { code: 'asc' },
        });

        const accountIds = accounts.map(a => a.id);

        const lines = await this.prisma.journalLine.findMany({
            where: {
                accountId: { in: accountIds },
                journal: {
                    status: 'POSTED',
                    ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
                },
            },
            select: {
                accountId: true,
                debit: true,
                credit: true,
            },
        });

        const map = new Map<number, { debit: number; credit: number }>();

        for (const line of lines) {
            if (!map.has(line.accountId)) {
                map.set(line.accountId, { debit: 0, credit: 0 });
            }

            const acc = map.get(line.accountId)!;
            acc.debit += Number(line.debit || 0);
            acc.credit += Number(line.credit || 0);
        }

        const result = accounts.map(acc => {
            const totals = map.get(acc.id) || { debit: 0, credit: 0 };

            let balance = 0;

            if (acc.nature === 'DEBIT') {
                balance = totals.debit - totals.credit;
            } else {
                balance = totals.credit - totals.debit;
            }

            return {
                accountId: acc.id,
                code: acc.code,
                name: acc.name,
                type: acc.accountBasicType,
                debit: totals.debit,
                credit: totals.credit,
                balance,
            };
        });

        const filteredResult = result.filter(
            acc => acc.debit !== 0 || acc.credit !== 0
        );

        const totalDebit = filteredResult.reduce((sum, r) => sum + r.debit, 0);
        const totalCredit = filteredResult.reduce((sum, r) => sum + r.credit, 0);

        return {
            filters: {
                from,
                to,
                accountId,
                accountBasicType,
            },
            totals: {
                totalDebit,
                totalCredit,
                isBalanced: totalDebit === totalCredit,
            },
            accounts: filteredResult,
        };
    }
}