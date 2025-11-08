import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

@Injectable()
export class AccountsService {
    constructor(private readonly prisma: PrismaService) { }

    // CREATE ACCOUNT
    async createAccount(dto: CreateAccountDto) {
        if (dto.parentId) {
            const parent = await this.prisma.account.findUnique({ where: { id: dto.parentId } });
            if (!parent) throw new NotFoundException('Parent account not found');
        }

        const exists = await this.prisma.account.findUnique({ where: { code: dto.code } });
        if (exists) throw new BadRequestException('Account code already exists');

        const account = await this.prisma.account.create({ data: dto });
        return { message: 'Account created successfully', account };
    }

    // UPDATE ACCOUNT
    async updateAccount(id: number, dto: UpdateAccountDto) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const updated = await this.prisma.account.update({
            where: { id },
            data: dto,
        });

        return { message: 'Account updated successfully', account: updated };
    }

    // DELETE ACCOUNT
    async deleteAccount(id: number) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) throw new NotFoundException('Account not found');

        const hasChildren = await this.prisma.account.findFirst({ where: { parentId: id } });
        if (hasChildren) throw new BadRequestException('Cannot delete an account with children');

        await this.prisma.account.delete({ where: { id } });
        return { message: 'Account deleted successfully' };
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

    // GET ACCOUNT BY ID
    async getAccountById(id: number) {
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: { children: true },
        });
        if (!account) throw new NotFoundException('Account not found');
        return account;
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

    // GET BANK ACCOUNT WITH ALL JOURNALS (REPORT)
    async getBankAccountReport() {
        const bankAccount = await this.prisma.account.findUnique({
            where: { code: '11000' },
            include: {
                entries: {
                    include: {
                        journal: {
                            include: {
                                postedBy: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                        client: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { id: 'desc' },
                },
            },
        });

        if (!bankAccount) throw new NotFoundException('Bank account with code 11000 not found');

        return {
            account: {
                id: bankAccount.id,
                name: bankAccount.name,
                code: bankAccount.code,
                debit: bankAccount.debit,
                credit: bankAccount.credit,
                balance: bankAccount.balance,
            },
            totalJournalEntries: bankAccount.entries.length,
            journals: bankAccount.entries.map((entry) => ({
                id: entry.journal.id,
                date: entry.journal.date,
                reference: entry.journal.reference,
                description: entry.description ?? entry.journal.description,
                debit: entry.debit,
                credit: entry.credit,
                balance: entry.balance,
                client: entry.client ? entry.client.name : null,
                postedBy: entry.journal.postedBy?.name ?? null,
                status: entry.journal.status,
                type: entry.journal.type,
            })),
        };
    }
}