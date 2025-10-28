import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto, UpdateJournalDto } from './dto/journal.dto';
import { JournalStatus } from '@prisma/client';

@Injectable()
export class JournalService {
    constructor(private readonly prisma: PrismaService) { }

    // Create journal
    async createJournal(dto: CreateJournalDto, userId?: number) {
        const totalDebit = dto.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = dto.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
        if (totalDebit !== totalCredit) {
            throw new BadRequestException('Journal not balanced (debits ≠ credits)');
        }

        const accountIds = dto.lines.map(l => l.accountId);
        const accounts = await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, nature: true },
        });

        const journal = await this.prisma.journalHeader.create({
            data: {
                reference: dto.reference,
                description: dto.description,
                type: dto.type,
                sourceType: dto.sourceType,
                sourceId: dto.sourceId,
                postedById: userId || null,
                lines: {
                    create: dto.lines.map((line) => {
                        const account = accounts.find(a => a.id === line.accountId);
                        if (!account) throw new BadRequestException(`Account ${line.accountId} not found`);

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

        return { message: 'Journal created successfully', journal };
    }

    // Update journal
    async updateJournal(id: number, dto: UpdateJournalDto) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id }, include: { lines: true } });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED) {
            throw new BadRequestException('Cannot update a posted journal');
        }

        if (dto.lines) {
            await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
        }

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

        return { message: 'Journal updated successfully', updated };
    }

    // Delete journal
    async deleteJournal(id: number) {
        const journal = await this.prisma.journalHeader.findUnique({ where: { id } });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED) {
            throw new BadRequestException('Cannot delete a posted journal');
        }

        await this.prisma.journalLine.deleteMany({ where: { journalId: id } });
        await this.prisma.journalHeader.delete({ where: { id } });
        return { message: 'Journal deleted successfully' };
    }

    // Get all journal headers
    async getAllJournals(
        page: number = 1,
        params: {
            limit?: number;
            search?: string;
            status?: string;
            type?: string;
        }) {
        const { limit = 10, search, status, type } = params;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (search) {
            where.OR = [
                { reference: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { sourceType: { contains: search, mode: 'insensitive' } },
                { postedBy: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        if (status) where.status = status as any;
        if (type) where.type = type as any;

        const [journals, total] = await Promise.all([
            this.prisma.journalHeader.findMany({
                where,
                include: { postedBy: { select: { id: true, name: true, email: true } } },
                skip,
                take: limit,
                orderBy: { date: 'desc' },
            }),
            this.prisma.journalHeader.count({ where }),
        ]);

        return {
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            limit,
            journals,
        };
    }

    // Get specific journal with lines
    async getJournalById(id: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: { include: { account: true, client: true } } },
        });
        if (!journal) throw new NotFoundException('Journal not found');
        return journal;
    }

    // POST JOURNAL
    async postJournal(id: number, userId?: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status === JournalStatus.POSTED)
            throw new BadRequestException('Journal already posted');

        await this.prisma.$transaction(async (tx) => {
            for (const line of journal.lines) {
                // Apply posting effect recursively (account + parents)
                await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'POST', line.clientId || undefined);
            }

            // Update journal status
            await tx.journalHeader.update({
                where: { id },
                data: { status: 'POSTED', postedById: userId || journal.postedById },
            });
        });

        return { message: 'Journal posted successfully', journalId: id };
    }

    // UNPOST JOURNAL
    async unpostJournal(id: number) {
        const journal = await this.prisma.journalHeader.findUnique({
            where: { id },
            include: { lines: true },
        });
        if (!journal) throw new NotFoundException('Journal not found');
        if (journal.status !== JournalStatus.POSTED)
            throw new BadRequestException('Only posted journals can be unposted');

        await this.prisma.$transaction(async (tx) => {
            for (const line of journal.lines) {
                // Apply reverse effect recursively (account + parents)
                await this.updateAccountHierarchy(tx, line.accountId, line.debit, line.credit, 'UNPOST', line.clientId || undefined);
            }

            // Revert journal status
            await tx.journalHeader.update({
                where: { id },
                data: { status: 'DRAFT' },
            });
        });

        return { message: 'Journal unposted successfully', journalId: id };
    }

    // Recursive account update helper
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

        // Account calculations
        const newDebit = action === 'POST'
            ? account.debit + debitChange
            : account.debit - debitChange;

        const newCredit = action === 'POST'
            ? account.credit + creditChange
            : account.credit - creditChange;

        const newBalance =
            account.nature === 'DEBIT'
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

        // Recursive parent update
        if (account.parentId) {
            await this.updateAccountHierarchy(tx, account.parentId, debitChange, creditChange, action);
        }
    }
}