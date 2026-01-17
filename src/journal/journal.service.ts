import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
import { JournalStatus, JournalSourceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DateTime } from 'luxon';
import moment from "moment-hijri";

@Injectable()
export class JournalService {
    constructor(private readonly prisma: PrismaService) { }

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }


    async createJournal(dto: CreateJournalDto, userId?: number) {

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
                throw new BadRequestException('No open period found. Please create a period first.');
            }
            periodId = currentPeriod.id;
        }

        const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
        if (totalDebit !== totalCredit) {
            throw new BadRequestException('القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن');
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
                        if (!account) throw new BadRequestException(`الحساب ${line.accountId} غير موجود`);

                        const balance =
                            account.nature === 'DEBIT'
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


    async updateJournal(currentUser, id: number, dto: UpdateJournalDto) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id }, include: { lines: true } });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED) {
            throw new BadRequestException('لا يمكن تعديل قيد معتمد');
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


    async deleteJournal(currentUser, id: number) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id } });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED) {
            throw new BadRequestException('لا يمكن حذف قيد معتمد');
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


    async getAllJournals(
        page: number = 1,
        params: {
            limit?: number;
            search?: string;
            status?: string;
            type?: string;
            reference?: string;
            description?: string;
            sourceType?: string;
            postedByName?: string;
            dateFrom?: string;
            dateTo?: string;
        }) {
        const { limit = 10, search, status, type, reference, description, sourceType, postedByName, dateFrom, dateTo } = params;
        const skip = (page - 1) * limit;

        const where: any = {};

        where.NOT = [
            {
                AND: [
                    { sourceType: JournalSourceType.PERIOD_CLOSING },
                    { status: { not: 'POSTED' } }
                ]
            }
        ];


        const orConditions: any[] = [];


        if (search) {
            const searchUpper = search.toUpperCase();

            const sourceTypeMatches: JournalSourceType[] = [];
            if (searchUpper.includes('LOAN') || searchUpper === 'LN') {
                sourceTypeMatches.push(JournalSourceType.LOAN);
            }
            if (searchUpper.includes('REPAYMENT') || searchUpper === 'REP') {
                sourceTypeMatches.push(JournalSourceType.REPAYMENT);
            }
            if (searchUpper.includes('PARTNER')) {
                sourceTypeMatches.push(JournalSourceType.PARTNER);
            }
            if (searchUpper.includes('WITHDRAWAL') || searchUpper.includes('سحب')) {
                sourceTypeMatches.push(JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL);
            }
            if (searchUpper.includes('DEPOSIT') || searchUpper.includes('إيداع')) {
                sourceTypeMatches.push(JournalSourceType.PARTNER_TRANSACTION_DEPOSIT);
            }

            if (searchUpper.includes('CLOSING') || searchUpper.includes('إقفال')) {
                sourceTypeMatches.push(JournalSourceType.PERIOD_CLOSING);
            }

            orConditions.push(
                { reference: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { postedBy: { name: { contains: search, mode: 'insensitive' } } },
            );


            if (sourceTypeMatches.length > 0) {
                const sourceTypeConditions = sourceTypeMatches.map((type) => {
                    if (type === JournalSourceType.PERIOD_CLOSING) {
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
            const sourceTypeValue = sourceType as JournalSourceType;
            if (sourceTypeValue === JournalSourceType.PERIOD_CLOSING) {
                orConditions.push({
                    AND: [
                        { sourceType: sourceTypeValue },
                        { status: 'POSTED' }
                    ]
                });
            } else {
                orConditions.push({ sourceType: sourceTypeValue });
            }
        }

        if (orConditions.length > 0) {
            where.OR = orConditions;
        }

        if (status) where.status = status as any;
        if (type) where.type = type as any;


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
                ? DateTime.fromJSDate(journal.date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,

            dateHijri: journal.date
                ? this.toHijri(journal.date)
                : null,

            createdAt: journal.createdAt
                ? DateTime.fromJSDate(journal.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,

            createdAtHijri: journal.createdAt
                ? this.toHijri(journal.createdAt)
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


    async getJournalById(id: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: {
                lines: { include: { account: true, client: true } },
                postedBy: { select: { id: true, name: true, email: true } }
            },
        });

        if (!journal) throw new NotFoundException('Journal not found');


        const totalDebit = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = journal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        const totalBalance = totalDebit - totalCredit;


        const normalize = (num: number) =>
            Math.abs(num) < 0.000001 ? 0 : Number(num.toFixed(2));

        return {
            ...journal,
            totals: {
                totalDebit: normalize(totalDebit),
                totalCredit: normalize(totalCredit),
                totalBalance: normalize(totalBalance),
            },
        };
    }


    async postJournal(id: number, userId: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED)
            throw new BadRequestException('Journal already posted');

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


    async unpostJournal(currentUser, id: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status !== JournalStatus.POSTED)
            throw new BadRequestException('Only posted journals can be unposted');

        if (journal.sourceType == "ZAKAT")
            throw new BadRequestException('لا يمكن الغاء اعتماد قيد الزكاة')

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


    private async updateAccountHierarchy(
        tx: any,
        accountId: number,
        debitChange: number,
        creditChange: number,
        action: 'POST' | 'UNPOST',
        clientId?: number
    ) {
        const account = await tx.account.findUnique({
            where: { id: accountId },
            select: { id: true, parentId: true, debit: true, credit: true, nature: true },
        });
        if (!account) throw new NotFoundException(`Account ${accountId} not found`);


        const newDebit = action === 'POST'
            ? account.debit + debitChange
            : account.debit - debitChange;

        const newCredit = action === 'POST'
            ? account.credit + creditChange
            : account.credit - creditChange;

        const newBalance = Number(
            account.nature === 'DEBIT'
                ? new Decimal(newDebit).minus(newCredit)
                : new Decimal(newCredit).minus(newDebit)
        );

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
                const updatedBalance = Number(new Decimal(updatedDebit).minus(updatedCredit));

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


    async postMultipleJournals(ids: number[], userId: number) {
        const journals = await this.prisma.journalHeader.findMany({
            where: { id: { in: ids } },
            include: { lines: true },
        });

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        return this.prisma.$transaction(async (tx) => {
            const results: any[] = [];

            for (const journal of journals) {
                if (journal.status === JournalStatus.POSTED) {
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


    async unpostMultipleJournals(ids: number[], userId: number) {
        const journals = await this.prisma.journalHeader.findMany({
            where: { id: { in: ids } },
            include: { lines: true },
        });

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        return this.prisma.$transaction(async (tx) => {
            const results: any[] = [];

            for (const journal of journals) {
                if (journal.status !== JournalStatus.POSTED) {
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


    async checkUnpostedOpeningJournals() {
        const unpostedOpeningJournals = await this.prisma.journalHeader.findMany({
            where: {
                type: 'OPENING',
                status: 'DRAFT'
            },
            select: {
                id: true,
                reference: true,
                description: true,
                date: true,
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return {
            hasUnpostedOpeningJournals: unpostedOpeningJournals.length > 0,
            unpostedOpeningJournals,
            count: unpostedOpeningJournals.length
        };
    }
}