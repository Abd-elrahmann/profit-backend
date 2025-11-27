import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { DateTime } from 'luxon';

@Injectable()
export class CompanyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    // Withdraw company profit
    async withdrawProfit(amount: number, userId: number) {
        if (amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');

        // Bank account (Cash in Bank)
        const bank = await this.prisma.account.findUnique({ where: { code: "11000" } });
        if (!bank) throw new NotFoundException('لم يتم العثور على حساب البنك');

        // Company Profit Account
        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount) throw new NotFoundException('لم يتم العثور على حساب أرباح الشركة');

        // Check available company profit
        if (companyProfitAccount.balance < amount)
            throw new BadRequestException('رصيد أرباح الشركة غير كافٍ لإجراء عملية السحب');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        // Create journal entry for profit withdrawal
        const journal = await this.journalService.createJournal(
            {
                reference: `COMPANY-WITHDRAW-${DateTime.now().toFormat('yyyyLLdd-HHmm')}`,
                description: 'سحب أرباح الشركة',
                type: 'GENERAL',
                sourceType: 'COMPANY_PROFIT_WITHDRAWAL',
                lines: [
                    {
                        // البنك (Credit)
                        accountId: bank.id,
                        debit: 0,
                        credit: amount,
                        description: 'سحب أرباح الشركة من حساب البنك',
                    },
                    {
                        // أرباح الشركة (Debit)
                        accountId: companyProfitAccount.id,
                        debit: amount,
                        credit: 0,
                        description: 'إثبات سحب أرباح الشركة',
                    },
                ],
            },
            userId,
        );

        // Post the journal
        await this.journalService.postJournal(journal.journal.id, userId);

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                userId: userId,
                screen: 'Company Profit',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بسحب مبلغ (${amount}) من أرباح الشركة وتم تسجيل قيد محاسبي رقم (${journal.journal.id}).`,
            },
        });

        return { message: 'تم سحب الأرباح بنجاح' };
    }

    // Get company profit balance and withdrawal journals with pagination & date filter
    async getProfitReport(
        page: number,
        filters?: {
            limit?: number;
            search?: string; 
            startDate?: string;     
            endDate?: string;
        },
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        // Get the COMPANY_SHARES account
        const companyProfitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });
        if (!companyProfitAccount) throw new NotFoundException('Company profit account not found');

        // Build where condition for journals
        const where: any = { sourceType: 'COMPANY_PROFIT_WITHDRAWAL', status: 'POSTED' };

        if (filters?.search) {
            where.OR = [
                { reference: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        if (filters?.startDate || filters?.endDate) {
            where.date = {};
            if (filters.startDate) {
                const startUtc = DateTime.fromISO(filters.startDate, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.gte = startUtc;
            }
            if (filters.endDate) {
                const endUtc = DateTime.fromISO(filters.endDate, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
                where.date.lte = endUtc;
            }
        }

        // Count total
        const totalWithdrawals = await this.prisma.journalHeader.count({ where });
        const totalPages = Math.ceil(totalWithdrawals / limit);

        // Fetch withdrawals
        const withdrawals = await this.prisma.journalHeader.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { lines: true },
        });

        // Format withdrawals with Saudi date only
        const formattedWithdrawals = withdrawals.map((j) => ({
            id: j.id,
            reference: j.reference,
            description: j.description,
            date: DateTime.fromJSDate(j.date).setZone('Asia/Riyadh').toFormat('yyyy-MM-dd'),
            amount: j.lines.reduce((sum, l) => sum + l.credit, 0),
        }));

        return {
            totalPages,
            currentPage: page,
            limit,
            availableAmount: companyProfitAccount.balance,
            totalWithdrawals,
            withdrawals: formattedWithdrawals,
        };
    }
}