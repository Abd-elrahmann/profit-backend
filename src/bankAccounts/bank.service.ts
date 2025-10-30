import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BankService {
    constructor(private prisma: PrismaService) { }

    async createBankAccount(data: { name: string; accountNumber: string , IBAN: string }) {
        const existing = await this.prisma.bANK_accounts.findFirst({
            where: { accountNumber: data.accountNumber },
        });

        if (existing) {
            throw new BadRequestException('Account number already exists.');
        }

        return this.prisma.bANK_accounts.create({ data });
    }

    async getAllBankAccounts(page: number = 1, limit = 10, filters?: any) {
        const where: any = {};

        if (filters?.search) {
            const search = filters.search.trim();
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                {
                    accountNumber: {
                        equals: isNaN(Number(search)) ? undefined : Number(search),
                    },
                },
            ];
        }

        const accounts = await this.prisma.bANK_accounts.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const total = await this.prisma.bANK_accounts.count({ where });

        return { total, page, limit, data: accounts };
    }

    async getBankAccountById(id: number) {
        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id },
            include: {
                loans: {
                    include: {
                        client: { select: { name: true, phone: true } },
                        partner: { select: { name: true } },
                    },
                },
            },
        });

        if (!bankAccount) throw new NotFoundException('Bank account not found.');

        return bankAccount;
    }

    async updateBankAccount(
        id: number,
        data: { name?: string; accountNumber?: string , IBAN?: string },
    ) {
        const existing = await this.prisma.bANK_accounts.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Bank account not found.');

        if (data.accountNumber && data.accountNumber !== existing.accountNumber) {
            const duplicate = await this.prisma.bANK_accounts.findFirst({
                where: { accountNumber: data.accountNumber },
            });
            if (duplicate) throw new BadRequestException('Account number already exists.');
        }

        return this.prisma.bANK_accounts.update({
            where: { id },
            data,
        });
    }

    async deleteBankAccount(id: number) {
        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id },
            include: { loans: true },
        });

        if (!bankAccount) throw new NotFoundException('Bank account not found.');
        if (bankAccount.loans.length > 0) {
            throw new BadRequestException(
                'Cannot delete this bank account because it has associated loans.',
            );
        }

        return this.prisma.bANK_accounts.delete({ where: { id } });
    }
}
