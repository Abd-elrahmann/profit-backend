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
exports.JournalService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const luxon_1 = require("luxon");
let JournalService = class JournalService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createJournal(dto, userId) {
        const user = userId ? await this.prisma.user.findUnique({
            where: { id: userId },
        }) : null;
        let periodId = dto.periodId;
        if (!periodId) {
            const currentPeriod = await this.prisma.periodHeader.findFirst({
                where: { endDate: null },
                orderBy: { startDate: 'desc' },
            });
            if (!currentPeriod) {
                throw new common_1.BadRequestException('No open period found. Please create a period first.');
            }
            periodId = currentPeriod.id;
        }
        const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
        if (totalDebit !== totalCredit) {
            throw new common_1.BadRequestException('القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن');
        }
        const accountIds = dto.lines.map(l => l.accountId);
        const accounts = await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, nature: true },
        });
        const journal = await this.prisma.journalHeader.create({
            data: {
                periodId,
                reference: dto.reference,
                description: dto.description,
                type: dto.type,
                sourceType: dto.sourceType,
                sourceId: dto.sourceId,
                postedById: null,
                lines: {
                    create: dto.lines.map((line) => {
                        const account = accounts.find(a => a.id === line.accountId);
                        if (!account)
                            throw new common_1.BadRequestException(`الحساب ${line.accountId} غير موجود`);
                        const balance = account.nature === 'DEBIT'
                            ? (line.debit || 0) - (line.credit || 0)
                            : (line.credit || 0) - (line.debit || 0);
                        return {
                            accountId: line.accountId,
                            debit: line.debit || 0,
                            credit: line.credit || 0,
                            description: line.description,
                            clientId: line.clientId || null,
                            balance,
                        };
                    }),
                },
            },
            include: { lines: true },
        });
        if (userId) {
            await this.prisma.auditLog.create({
                data: {
                    userId: userId,
                    screen: 'Journals',
                    action: 'CREATE',
                    description: `قام المستخدم ${user?.name || 'غير معروف'} بإنشاء قيد يومية برقم مرجعي ${journal.reference}`,
                },
            });
        }
        return { message: 'تم انشاء القيد بنجاح', journal };
    }
    async updateJournal(currentUser, id, dto) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id }, include: { lines: true } });
        if (!journal)
            throw new common_1.NotFoundException('Journal not found');
        if (journal.status === client_1.JournalStatus.POSTED) {
            throw new common_1.BadRequestException('لا يمكن تعديل قيد معتمد');
        }
        if (dto.lines) {
            await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const updated = await this.prisma.journalHeader.update({
            where: { id },
            data: {
                description: dto.description,
                type: dto.type,
                status: dto.status,
                lines: dto.lines
                    ? {
                        create: dto.lines.map((line) => ({
                            accountId: line.accountId,
                            debit: line.debit || 0,
                            credit: line.credit || 0,
                            description: line.description,
                            clientId: line.clientId || null,
                            balance: (line.debit || 0) - (line.credit || 0),
                        })),
                    }
                    : undefined,
            },
            include: { lines: true },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Journals',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتعديل قيد يومية برقم مرجعي ${journal.reference}`,
            },
        });
        return { message: 'تم تعديل القيد بنجاح', updated };
    }
    async deleteJournal(currentUser, id) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id } });
        if (!journal)
            throw new common_1.NotFoundException('Journal not found');
        if (journal.status === client_1.JournalStatus.POSTED) {
            throw new common_1.BadRequestException('لا يمكن حذف قيد معتمد');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
        await this.prisma.journalHeader.delete({ where: { id } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Journals',
                action: 'DELETE',
                description: `قام المستخدم ${user?.name} بحذف قيد يومية برقم مرجعي ${journal.reference}`,
            },
        });
        return { message: 'تم حذف القيد بنجاح' };
    }
    async getAllJournals(page = 1, params) {
        const { limit = 10, search, status, type, reference, description, sourceType, postedByName, dateFrom, dateTo } = params;
        const skip = (page - 1) * limit;
        const where = {};
        where.NOT = [
            {
                AND: [
                    { sourceType: client_1.JournalSourceType.PERIOD_CLOSING },
                    { status: { not: 'POSTED' } }
                ]
            }
        ];
        const orConditions = [];
        if (search) {
            const searchUpper = search.toUpperCase();
            const sourceTypeMatches = [];
            if (searchUpper.includes('LOAN') || searchUpper === 'LN') {
                sourceTypeMatches.push(client_1.JournalSourceType.LOAN);
            }
            if (searchUpper.includes('REPAYMENT') || searchUpper === 'REP') {
                sourceTypeMatches.push(client_1.JournalSourceType.REPAYMENT);
            }
            if (searchUpper.includes('PARTNER')) {
                sourceTypeMatches.push(client_1.JournalSourceType.PARTNER);
            }
            if (searchUpper.includes('WITHDRAWAL') || searchUpper.includes('سحب')) {
                sourceTypeMatches.push(client_1.JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL);
            }
            if (searchUpper.includes('DEPOSIT') || searchUpper.includes('إيداع')) {
                sourceTypeMatches.push(client_1.JournalSourceType.PARTNER_TRANSACTION_DEPOSIT);
            }
            if (searchUpper.includes('CLOSING') || searchUpper.includes('إقفال')) {
                sourceTypeMatches.push(client_1.JournalSourceType.PERIOD_CLOSING);
            }
            orConditions.push({ reference: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { postedBy: { name: { contains: search, mode: 'insensitive' } } });
            if (sourceTypeMatches.length > 0) {
                const sourceTypeConditions = sourceTypeMatches.map((type) => {
                    if (type === client_1.JournalSourceType.PERIOD_CLOSING) {
                        return {
                            AND: [
                                { sourceType: type },
                                { status: 'POSTED' }
                            ]
                        };
                    }
                    return { sourceType: type };
                });
                orConditions.push(...sourceTypeConditions);
            }
        }
        if (reference) {
            orConditions.push({ reference: { contains: reference, mode: 'insensitive' } });
        }
        if (description) {
            orConditions.push({ description: { contains: description, mode: 'insensitive' } });
        }
        if (postedByName) {
            orConditions.push({ postedBy: { name: { contains: postedByName, mode: 'insensitive' } } });
        }
        if (sourceType) {
            const sourceTypeValue = sourceType;
            if (sourceTypeValue === client_1.JournalSourceType.PERIOD_CLOSING) {
                orConditions.push({
                    AND: [
                        { sourceType: sourceTypeValue },
                        { status: 'POSTED' }
                    ]
                });
            }
            else {
                orConditions.push({ sourceType: sourceTypeValue });
            }
        }
        if (orConditions.length > 0) {
            where.OR = orConditions;
        }
        if (status)
            where.status = status;
        if (type)
            where.type = type;
        if (dateFrom || dateTo) {
            where.date = {};
            if (dateFrom) {
                where.date.gte = new Date(dateFrom);
            }
            if (dateTo) {
                where.date.lte = new Date(dateTo);
            }
        }
        const [unformmatedjournals, total] = await Promise.all([
            this.prisma.journalHeader.findMany({
                where,
                include: { postedBy: { select: { id: true, name: true, email: true } } },
                skip,
                take: limit,
                orderBy: { date: 'desc' },
            }),
            this.prisma.journalHeader.count({ where }),
        ]);
        const journals = unformmatedjournals.map((journal) => ({
            ...journal,
            date: journal.date
                ? luxon_1.DateTime.fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            createdAt: journal.createdAt
                ? luxon_1.DateTime.fromJSDate(journal.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
        }));
        return {
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            limit,
            journals,
        };
    }
    async getJournalById(id) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: {
                lines: { include: { account: true, client: true } },
                postedBy: { select: { id: true, name: true, email: true } }
            },
        });
        if (!journal)
            throw new common_1.NotFoundException('Journal not found');
        const totalDebit = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = journal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        const totalBalance = totalDebit - totalCredit;
        const normalize = (num) => Math.abs(num) < 0.000001 ? 0 : Number(num.toFixed(2));
        return {
            ...journal,
            totals: {
                totalDebit: normalize(totalDebit),
                totalCredit: normalize(totalCredit),
                totalBalance: normalize(totalBalance),
            },
        };
    }
    async postJournal(id, userId) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal)
            throw new common_1.NotFoundException('Journal not found');
        if (journal.status === client_1.JournalStatus.POSTED)
            throw new common_1.BadRequestException('Journal already posted');
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        await this.prisma.$transaction(async (tx) => {
            for (const line of journal.lines) {
                await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'POST', line.clientId || undefined);
            }
            await tx.journalHeader.update({
                where: { id },
                data: { status: 'POSTED', postedById: userId || journal.postedById },
            });
        });
        await this.prisma.auditLog.create({
            data: {
                userId: userId || 0,
                screen: 'Journals',
                action: 'POST',
                description: `قام المستخدم ${user?.name} باعتماد قيد يومية برقم مرجعي ${journal.reference}`,
            },
        });
        return { message: 'تم اعتماد القيد بنجاح', journalId: id };
    }
    async unpostJournal(currentUser, id) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal)
            throw new common_1.NotFoundException('Journal not found');
        if (journal.status !== client_1.JournalStatus.POSTED)
            throw new common_1.BadRequestException('Only posted journals can be unposted');
        if (journal.sourceType == "ZAKAT")
            throw new common_1.BadRequestException('لا يمكن الغاء اعتماد قيد الزكاة');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.$transaction(async (tx) => {
            for (const line of journal.lines) {
                await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'UNPOST', line.clientId || undefined);
            }
            await tx.journalHeader.update({
                where: { id },
                data: { status: 'DRAFT' },
            });
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Journals',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإلغاء اعتماد قيد يومية برقم مرجعي ${journal.reference}`,
            },
        });
        return { message: 'تم الغاء اعتماد القيد بنجاح', journalId: id };
    }
    async updateAccountHierarchy(tx, accountId, debitChange, creditChange, action, clientId) {
        const account = await tx.account.findUnique({
            where: { id: accountId },
            select: { id: true, parentId: true, debit: true, credit: true, nature: true },
        });
        if (!account)
            throw new common_1.NotFoundException(`Account ${accountId} not found`);
        const newDebit = action === 'POST'
            ? account.debit + debitChange
            : account.debit - debitChange;
        const newCredit = action === 'POST'
            ? account.credit + creditChange
            : account.credit - creditChange;
        const newBalance = account.nature === 'DEBIT'
            ? newDebit - newCredit
            : newCredit - newDebit;
        await tx.account.update({
            where: { id: account.id },
            data: { debit: newDebit, credit: newCredit, balance: newBalance },
        });
        if (clientId) {
            const client = await tx.client.findUnique({
                where: { id: clientId },
                select: { debit: true, credit: true, balance: true },
            });
            if (client) {
                const updatedDebit = action === 'POST'
                    ? client.debit + debitChange
                    : client.debit - debitChange;
                const updatedCredit = action === 'POST'
                    ? client.credit + creditChange
                    : client.credit - creditChange;
                const updatedBalance = updatedDebit - updatedCredit;
                await tx.client.update({
                    where: { id: clientId },
                    data: {
                        debit: updatedDebit,
                        credit: updatedCredit,
                        balance: updatedBalance,
                    },
                });
            }
        }
        if (account.parentId) {
            await this.updateAccountHierarchy(tx, account.parentId, debitChange, creditChange, action);
        }
    }
    async postMultipleJournals(ids, userId) {
        const journals = await this.prisma.journalHeader.findMany({
            where: { id: { in: ids } },
            include: { lines: true },
        });
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return this.prisma.$transaction(async (tx) => {
            const results = [];
            for (const journal of journals) {
                if (journal.status === client_1.JournalStatus.POSTED) {
                    results.push({ journalId: journal.id, status: 'already posted' });
                    continue;
                }
                for (const line of journal.lines) {
                    await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'POST', line.clientId || undefined);
                }
                await tx.journalHeader.update({
                    where: { id: journal.id },
                    data: { status: 'POSTED', postedById: userId },
                });
                await tx.auditLog.create({
                    data: {
                        userId,
                        screen: 'Journals',
                        action: 'POST',
                        description: `قام المستخدم ${user?.name} باعتماد قيد يومية برقم مرجعي ${journal.reference}`,
                    },
                });
                results.push({ journalId: journal.id, status: 'posted' });
            }
            return results;
        });
    }
    async unpostMultipleJournals(ids, userId) {
        const journals = await this.prisma.journalHeader.findMany({
            where: { id: { in: ids } },
            include: { lines: true },
        });
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        return this.prisma.$transaction(async (tx) => {
            const results = [];
            for (const journal of journals) {
                if (journal.status !== client_1.JournalStatus.POSTED) {
                    results.push({ journalId: journal.id, status: 'not posted' });
                    continue;
                }
                if (journal.sourceType === 'ZAKAT') {
                    results.push({ journalId: journal.id, status: 'cannot unpost ZAKAT' });
                    continue;
                }
                for (const line of journal.lines) {
                    await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'UNPOST', line.clientId || undefined);
                }
                await tx.journalHeader.update({
                    where: { id: journal.id },
                    data: { status: 'DRAFT' },
                });
                await tx.auditLog.create({
                    data: {
                        userId,
                        screen: 'Journals',
                        action: 'UNPOST',
                        description: `قام المستخدم ${user?.name} بإلغاء اعتماد قيد يومية برقم مرجعي ${journal.reference}`,
                    },
                });
                results.push({ journalId: journal.id, status: 'unposted' });
            }
            return results;
        });
    }
};
exports.JournalService = JournalService;
exports.JournalService = JournalService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], JournalService);
//# sourceMappingURL=journal.service.js.map