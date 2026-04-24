import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BankService {
    constructor(private prisma: PrismaService) { }

    private async generateNextCode(prefix: string): Promise<string> {
        const latest = await this.prisma.account.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
        });

        const nextCode = latest ? (parseInt(latest.code) + 10).toString() : `${prefix}000`;
        return nextCode;
    }

    async createBankAccount(currentUser, data: { name: string; owner: string; accountNumber: string, IBAN: string, limit: number }) {
        const existing = await this.prisma.bANK_accounts.findFirst({
            where: { accountNumber: data.accountNumber },
        });

        if (existing) {
            throw new BadRequestException('رقم الحساب موجود مسبقاً.');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const ParentBank = await this.prisma.account.findUniqueOrThrow({ where: { code: '11000' } });

        const account = await this.prisma.account.create({
            data: {
                name: data.name,
                code: await this.generateNextCode('11'),
                parentId: ParentBank.id,
                type: 'ASSET',
                accountBasicType: 'BANK',
                nature: 'DEBIT',
                level: 3,
            },
        });

        const bank = await this.prisma.bANK_accounts.create({
            data: {
                ...data,
                status: data.limit > 0 ? 'Active' : 'Expired',
                accountId: account.id,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء حساب بنكي جديد: ${data.name}`,
            },
        });

        return bank;
    }

    async getAllBankAccounts(page: number = 1, limit = 10, filters?: any) {
        const where: any = {};

        if (filters?.search) {
            const search = filters.search.trim();
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { IBAN: { contains: search, mode: 'insensitive' } },
                { owner: { contains: search, mode: 'insensitive' } },
                {
                    accountNumber: {
                        equals: isNaN(Number(search)) ? undefined : Number(search),
                    },
                },
            ];
        }

        const accounts = await this.prisma.bANK_accounts.findMany({
            where,
            include: { account: { select: { balance: true } } },
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
                account: { select: { balance: true } },
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
        currentUser,
        id: number,
        data: { name?: string; owner: string; accountNumber?: string, IBAN?: string, limit?: number },
    ) {
        const existing = await this.prisma.bANK_accounts.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Bank account not found.');

        if (data.accountNumber && data.accountNumber !== existing.accountNumber) {
            const duplicate = await this.prisma.bANK_accounts.findFirst({
                where: { accountNumber: data.accountNumber },
            });
            if (duplicate) throw new BadRequestException('رقم الحساب موجود مسبقاً.');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });


        const updateData: any = { ...data };


        if (data.limit !== undefined) {
            updateData.status = data.limit > 0 ? 'Active' : 'Expired';
        }

        if (data.name && existing.accountId) {
            await this.prisma.account.update({
                where: { id: existing.accountId },
                data: {
                    name: data.name,
                },
            });
        }

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث الحساب البنكي: ${existing.name}`,
            },
        });

        return this.prisma.bANK_accounts.update({
            where: { id },
            data: updateData,
        });
    }

    async deleteBankAccount(currentUser, id: number) {
        const bankAccount = await this.prisma.bANK_accounts.findUnique({
            where: { id },
            include: { loans: true },
        });

        if (!bankAccount) throw new NotFoundException('Bank account not found.');
        if (bankAccount.loans.length > 0) {
            throw new BadRequestException(
                'لا يمكن حذف الحساب البنكي لارتباطه بسلف.',
            );
        }

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        if (bankAccount.accountId) {
            await this.prisma.account.delete({
                where: { id: bankAccount.accountId },
            });
        }

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Bank Accounts',
                action: 'DELETE',
                description: `قام المستخدم ${user?.name} بحذف الحساب البنكي: ${bankAccount.name}`,
            },
        });

        return this.prisma.bANK_accounts.delete({ where: { id } });
    }
}