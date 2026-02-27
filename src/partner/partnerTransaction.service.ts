import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType, JournalStatus, JournalType } from '@prisma/client';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';
import moment from "moment-hijri";
dotenv.config();

@Injectable()
export class partnerTransactionService {
    constructor(
        private prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    async createPartnerTransaction(
        currentUser: number,
        partnerId: number,
        dto: {
            type: 'DEPOSIT' | 'WITHDRAWAL' | 'PROFIT_WITHDRAWAL' | 'SAVING_WITHDRAWAL'
            ; amount: number; description?: string
        }
    ) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: { AccountEquity: true, AccountSaving: true },
        });
        if (!partner) throw new NotFoundException('Partner not found');

        if (!partner.accountEquityId)
            throw new BadRequestException('Partner capital account not defined');

        if (dto.amount <= 0) throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر.');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        if (dto.type === 'SAVING_WITHDRAWAL') {
            if (partner.AccountSaving.balance < dto.amount) {
                throw new BadRequestException(`رصيد توفير الشريك غير كافٍ للسحب. الرصيد الحالي: ${partner.AccountSaving.balance}`);
            }
        }

        if (dto.type === 'WITHDRAWAL') {
            const monthsSinceCreation = DateTime.now()
                .diff(DateTime.fromJSDate(partner.createdAt), 'months')
                .months;

            if (monthsSinceCreation < 15) {
                throw new BadRequestException('لا يمكن السحب من رأس المال قبل مرور 15 شهرًا على الإيداع.');
            }

            if (partner.capitalAmount < dto.amount) {
                throw new BadRequestException('رصيد رأس المال غير كافٍ للسحب.');
            }
        }

        if (dto.type === 'PROFIT_WITHDRAWAL') {
            if (partner.totalProfit < dto.amount) {
                throw new BadRequestException('رصيد الأرباح غير كافٍ للسحب.');
            }
        }

        const reference = `PT-${partnerId}-${Date.now()}`;

        const transaction = await this.prisma.partnerTransaction.create({
            data: {
                partnerId,
                type: dto.type,
                amount: dto.amount,
                description: dto.description,
                reference,
            },
        });

        const bank = await this.prisma.account.findUnique({ where: { code: '11000' } });
        if (!bank) throw new BadRequestException('Bank account (11000) must exist');

        const savingAccount = await this.prisma.account.findUnique({ where: { code: '20002' } });
        if (!savingAccount) throw new BadRequestException('saving Account (20002) must exist');

        const newCapitalBank = await this.prisma.account.findUnique({
            where: { code: '11001' },
        });
        if (!newCapitalBank)
            throw new BadRequestException('New Capital Bank (11001) must exist');

        let journalLines;
        let journalDescription;

        if (dto.type === 'DEPOSIT') {
            journalLines = [
                {
                    accountId: newCapitalBank.id,
                    debit: dto.amount,
                    credit: 0,
                    description: `إيداع رأس مال جديد من الشريك ${partner.name}`,
                },
                {
                    accountId: partner.accountNewCapitalId,
                    debit: 0,
                    credit: dto.amount,
                    description: `رأس مال جديد - ${partner.name}`,
                },
            ];
            journalDescription = `إيداع رأس مال جديد من الشريك ${partner.name}`;
        } else if (dto.type === 'WITHDRAWAL') {
            journalLines = [
                {
                    accountId: partner.accountEquityId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من رأس مال الشريك ${partner.name}`,
                },
                {
                    accountId: bank.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `سحب نقدي للشريك ${partner.name}`,
                },
            ];
            journalDescription = `سحب نقدي من رأس مال الشريك ${partner.name}`;
        }

        if (dto.type === 'PROFIT_WITHDRAWAL') {
            journalLines = [
                {
                    accountId: partner.accountPayableId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من أرباح الشريك ${partner.name}`,
                },
                {
                    accountId: bank.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `صرف أرباح للشريك ${partner.name}`,
                },
            ];
            journalDescription = `سحب أرباح للشريك ${partner.name}`;
        }

        if (dto.type === 'SAVING_WITHDRAWAL') {
            journalLines = [
                {
                    accountId: partner.accountSavingId,
                    debit: dto.amount,
                    credit: 0,
                    description: `سحب من توفير الشريك ${partner.name}`,
                },
                {
                    accountId: savingAccount.id,
                    debit: 0,
                    credit: dto.amount,
                    description: `صرف من توفير الشريك ${partner.name}`,
                },
            ];

            journalDescription = `سحب من التوفير للشريك ${partner.name}`;
        }

        const journalDto = {
            reference,
            description: journalDescription,
            type: JournalType.GENERAL,
            sourceType:
                dto.type === 'DEPOSIT'
                    ? JournalSourceType.PARTNER_TRANSACTION_DEPOSIT
                    : dto.type === 'WITHDRAWAL'
                        ? JournalSourceType.PARTNER_TRANSACTION_WITHDRAWAL
                        : dto.type === 'PROFIT_WITHDRAWAL'
                            ? JournalSourceType.PARTNER_PROFIT_WITHDRAWAL
                            : JournalSourceType.PARTNER_SAVING_WITHDRAWAL,

            lines: journalLines,
        };


        const journal = await this.journalService.createJournal(journalDto, currentUser);

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, currentUser);
        }

        let newCapitalAmount = partner.capitalAmount;
        let newTotalAmount = partner.totalAmount;
        let newProfitAmount = partner.totalProfit;

        const existingNewCapital = await this.prisma.partnerNewCapital.findFirst({
            where: { partnerId: partner.id },
        });

        if (dto.type === 'DEPOSIT') {
            if (existingNewCapital) {
                await this.prisma.partnerNewCapital.update({
                    where: { id: existingNewCapital.id },
                    data: {
                        amount: { increment: dto.amount },
                        remaining: { increment: dto.amount },
                    },
                });
            } else {
                await this.prisma.partnerNewCapital.create({
                    data: {
                        partnerId: partner.id,
                        amount: dto.amount,
                        remaining: dto.amount,
                    },
                });
            }
        }

        if (dto.type === 'WITHDRAWAL') {
            newCapitalAmount -= dto.amount;
            newTotalAmount -= dto.amount;

        } else if (dto.type === 'PROFIT_WITHDRAWAL') {
            newProfitAmount -= dto.amount;
            newTotalAmount -= dto.amount;
        }

        await this.prisma.partner.update({
            where: { id: partnerId },
            data: {
                capitalAmount: newCapitalAmount,
                totalAmount: newTotalAmount,
                totalProfit: newProfitAmount
            },
        });

        await this.prisma.partnerTransaction.update({
            where: { id: transaction.id },
            data: { journalId: journal.journal.id },
        });


        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Partners',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء معاملة ${dto.type === 'DEPOSIT' ? 'إيداع' :
                    dto.type === 'WITHDRAWAL' ? 'سحب من رأس المال' :
                        dto.type === 'PROFIT_WITHDRAWAL' ? 'سحب من الأرباح' :
                            'سحب من التوفير'
                    } بقيمة ${dto.amount} للشريك ${partner.name} (تم إنشاء وترحيل القيد المحاسبي بنجاح)`,
            },
        });

        return {
            message: 'تم إنشاء معاملة المساهم بنجاح',
            transaction,
            journal,
        };
    }

    async deletePartnerTransaction(currentUser: number, id: number) {
        const transaction = await this.prisma.partnerTransaction.findUnique({
            where: { id },
            include: { partner: true },
        });
        if (!transaction) throw new NotFoundException('Transaction not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });


        const journal = await this.prisma.journalHeader.findUnique({
            where: { reference: transaction.reference || '' },
            include: { lines: true },
        });

        if (journal) {
            if (journal.status === JournalStatus.POSTED) {
                await this.journalService.unpostJournal(currentUser, journal.id);
            }

            await this.prisma.journalLine.deleteMany({
                where: { journalId: journal.id },
            });
            await this.prisma.journalHeader.deleteMany({
                where: { id: journal.id },
            });
        }


        const partner = await this.prisma.partner.findUnique({ where: { id: transaction.partnerId } });
        if (partner) {
            let newCapitalAmount = partner.capitalAmount;
            let newTotalAmount = partner.totalAmount;
            let newTotalProfit = partner.totalProfit;

            if (transaction.type === 'DEPOSIT') {
                const newCapital = await this.prisma.partnerNewCapital.findFirst({
                    where: { partnerId: partner.id },
                    orderBy: { id: 'desc' },
                });

                if (!newCapital || newCapital.remaining < transaction.amount) {
                    throw new BadRequestException(
                        'لا يمكن حذف الإيداع، رصيد رأس المال الجديد غير كافٍ'
                    );
                }

                await this.prisma.partnerNewCapital.update({
                    where: { id: newCapital.id },
                    data: {
                        amount: { decrement: transaction.amount },
                        remaining: { decrement: transaction.amount },
                    },
                });
            }
            else if (transaction.type === 'WITHDRAWAL') {
                newCapitalAmount += transaction.amount;
                newTotalAmount += transaction.amount;
            } else if (transaction.type === 'PROFIT_WITHDRAWAL') {
                newTotalProfit += transaction.amount;
                newTotalAmount += transaction.amount;
            }

            await this.prisma.partner.update({
                where: { id: partner.id },
                data: {
                    capitalAmount: newCapitalAmount,
                    totalAmount: newTotalAmount,
                    totalProfit: newTotalProfit
                },
            });


            await this.prisma.partnerTransaction.delete({ where: { id } });


            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Partners',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بحذف معاملة ${transaction.type === 'DEPOSIT' ? 'إيداع' : 'سحب'} بقيمة ${transaction.amount} للشريك ${transaction.partner.name}`,
                },
            });

            return { message: 'تم حذف معاملة المساهم بنجاح' };
        }
    }

    async getPartnerTransactions(
        partnerId: number,
        page: number,
        filters?: {
            limit?: number;
            type?: 'DEPOSIT' | 'WITHDRAWAL' | 'PROFIT_WITHDRAWAL' | 'SAVING_WITHDRAWAL';
            search?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const limit = filters?.limit && Number(filters.limit) > 0 ? Number(filters.limit) : 10;
        const skip = (page - 1) * limit;

        const where: any = { partnerId };


        if (filters?.type) where.type = filters.type;


        if (filters?.search)
            where.OR = [
                { description: { contains: filters.search, mode: 'insensitive' } },
                { reference: { contains: filters.search, mode: 'insensitive' } },
            ];


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


        const totalTransactions = await this.prisma.partnerTransaction.count({ where });
        const totalPages = Math.ceil(totalTransactions / limit);


        const transactions = await this.prisma.partnerTransaction.findMany({
            where,
            skip,
            take: limit,
            orderBy: { date: 'desc' },
            include: { partner: { select: { name: true } } },
        });

        const toHijri = (date: Date | null) => {
            if (!date) return null;
            return moment(date).locale('ar-SA').format('iDD iMMMM iYYYY');
        };


        const convertedTransactions = transactions.map((t) => ({
            ...t,
            date: DateTime.fromJSDate(t.date, { zone: 'utc' })
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd HH:mm:ss'),
            dateHijri: toHijri(t.date),
        }));

        return {
            totalTransactions,
            totalPages,
            currentPage: page,
            limit,
            transactions: convertedTransactions,
        };
    }
}