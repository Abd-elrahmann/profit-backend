import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class ExternalInvestmentService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    async withdraw(userId: number, amount: number, bankAccountId: number) {
        const bank = await this.prisma.bANK_accounts.findUnique({
            where: { id: bankAccountId },
            include: { account: true },
        });

        if (!bank || !bank.accountId) {
            throw new BadRequestException('حساب البنك غير موجود');
        }

        const outsideAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'EXTERNAL_INVESTMENT' },
        });

        if (!outsideAccount) throw new NotFoundException('External investment account not found');

        const partners = await this.prisma.partner.findMany({
            where: { isActive: true, isFrozen: false },
        });

        const totalCapital = partners.reduce((sum, p) => sum + p.totalAmount, 0);

        const record = await this.prisma.externalInvestment.create({
            data: {
                userId,
                amount,
                bankAccountId,
            },
        });

        for (const p of partners) {
            const percent = totalCapital > 0 ? (p.totalAmount / totalCapital) * 100 : 0;
            await this.prisma.externalInvestmentPartnerShare.create({
                data: {
                    externalInvestmentId: record.id,
                    partnerId: p.id,
                    sharePercent: percent,
                    orgProfitPercent: p.orgProfitPercent,
                },
            });
        }

        const journal = await this.journalService.createJournal({
            reference: `EXT-INV-${record.id}`,
            sourceType: 'EXTERNAL_PROFIT',
            sourceId: record.id,
            type: 'GENERAL',
            description: 'سحب استثمار خارجي',
            lines: [
                { accountId: outsideAccount.id, debit: amount, credit: 0 },
                { accountId: bank.accountId, debit: 0, credit: amount },
            ],
        });

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'ExternalInvestment',
                action: 'CREATE',
                description: `تم سحب مبلغ ${amount} كاستثمار خارجي - رقم السجل: ${record.id}`,
            },
        });

        return record;
    }

    async returnInvestment(id: number, returnedAmount: number, userId: number) {
        const record = await this.prisma.externalInvestment.findUnique({
            where: { id },
        });

        if (!record || !record.bankAccountId) throw new NotFoundException('Record not found');
        if (record.status === 'CLOSED') throw new BadRequestException('Already closed');

        const bank = await this.prisma.bANK_accounts.findUnique({
            where: { id: record.bankAccountId },
            include: { account: true },
        });

        const outsideAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'EXTERNAL_INVESTMENT' },
        });

        const profitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'EXTERNAL_PROFIT' },
        });

        if (!bank || !bank.accountId) {
            throw new BadRequestException('حساب البنك غير موجود');
        }

        if (!outsideAccount) throw new NotFoundException('External investment account not found');
        if (!profitAccount) throw new NotFoundException('External profit account not found');

        const profit = returnedAmount - record.amount;

        if (profit < 0) {
            throw new BadRequestException(' المبلغ أقل من المسحوب');
        }

        await this.prisma.externalInvestment.update({
            where: { id },
            data: {
                returnedAmount: returnedAmount,
                profit,
                status: 'CLOSED',
                returnedAt: new Date(),
            },
        });

        const journal = await this.journalService.createJournal({
            reference: `EXT-INV-RETURN-${id}`,
            sourceType: 'EXTERNAL_PROFIT',
            sourceId: id,
            type: 'GENERAL',
            description: 'إرجاع استثمار خارجي',
            lines: [
                {
                    accountId: bank.accountId,
                    debit: returnedAmount,
                    credit: 0,
                },
                {
                    accountId: outsideAccount.id,
                    debit: 0,
                    credit: record.amount,
                },
                {
                    accountId: profitAccount.id,
                    debit: 0,
                    credit: profit,
                },
            ],
        });

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'ExternalInvestment',
                action: 'UPDATE',
                description: `تم إرجاع الاستثمار رقم ${id} - المبلغ المُرجع: ${returnedAmount} - الربح: ${profit}`,
            },
        });

        return { ...record, profit };
    }

    async findAll(
        page: number = 1,
        limit: number = 10,
        status?: 'OPEN' | 'CLOSED',
        userId?: number,
        bankAccountId?: number,
        fromDate?: string,
        toDate?: string,
    ) {
        const skip = (page - 1) * limit;
        const where: any = {};

        if (status) where.status = status;
        if (userId) where.userId = userId;
        if (bankAccountId) where.bankAccountId = bankAccountId;
        if (fromDate || toDate) {
            where.createdAt = {};
            if (fromDate) where.createdAt.gte = new Date(fromDate);
            if (toDate) where.createdAt.lte = new Date(toDate);
        }

        const [data, total] = await Promise.all([
            this.prisma.externalInvestment.findMany({
                where,
                include: {
                    user: { select: { id: true, name: true } },
                    bankAccount: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.externalInvestment.count({ where }),
        ]);

        return {
            totalPages: Math.ceil(total / limit),
            CurrentPage: page,
            limit,
            count: total,
            data,
        };
    }

    async findOne(id: number) {
        const record = await this.prisma.externalInvestment.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, name: true, email: true } },
                bankAccount: { select: { id: true, name: true } },
                partnerShares: {
                    include: {
                        partner: {
                            select: {
                                id: true,
                                name: true,
                                totalAmount: true,
                                orgProfitPercent: true,
                            },
                        },
                    },
                },
            },
        });

        if (!record) throw new NotFoundException('Record not found');

        const profit = record.status === 'CLOSED'
            ? (record.profit ?? 0)
            : null;

        const partnerBreakdown = record.partnerShares.map((share) => {
            const rawProfitShare = profit !== null
                ? (profit * share.sharePercent) / 100
                : null;

            const orgCut = rawProfitShare !== null
                ? (rawProfitShare * share.orgProfitPercent) / 100
                : null;

            const partnerFinal = rawProfitShare !== null && orgCut !== null
                ? rawProfitShare - orgCut
                : null;

            return {
                partnerId: share.partnerId,
                partnerName: share.partner.name,
                sharePercent: share.sharePercent,
                orgProfitPercent: share.orgProfitPercent,
                rawProfitShare,
                orgCut,
                partnerFinal,
            };
        });

        const { partnerShares, ...rest } = record;

        return {
            ...rest,
            partnerBreakdown,
        };
    }

    async distributeProfit(id: number, userId: number) {
        const record = await this.prisma.externalInvestment.findUnique({
            where: { id },
            include: {
                partnerShares: {
                    include: {
                        partner: {
                            include: {
                                AccountPayable: true,
                            },
                        },
                    },
                },
            },
        });

        if (!record) throw new NotFoundException('Record not found');
        if (record.status !== 'CLOSED') throw new BadRequestException('الاستثمار لم يُغلق بعد - لا يمكن توزيع الأرباح');
        if (record.profit === null || record.profit === undefined) throw new BadRequestException('لا يوجد ربح لتوزيعه');
        if (record.isDistributed) throw new BadRequestException('تم توزيع الأرباح مسبقاً');

        const profitAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'EXTERNAL_PROFIT' },
        });

        const companySharesAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'COMPANY_SHARES' },
        });

        if (!profitAccount) throw new NotFoundException('External profit account not found');
        if (!companySharesAccount) throw new NotFoundException('Company shares account not found');

        const profit = record.profit;
        const journalLines: { accountId: number; debit: number; credit: number }[] = [];
        let totalOrgCut = 0;

        for (const share of record.partnerShares) {
            const rawProfitShare = (profit * share.sharePercent) / 100;
            const orgCut = (rawProfitShare * share.orgProfitPercent) / 100;
            const partnerFinal = rawProfitShare - orgCut;

            totalOrgCut += orgCut;

            journalLines.push({
                accountId: profitAccount.id,
                debit: partnerFinal,
                credit: 0,
            });
            journalLines.push({
                accountId: share.partner.AccountPayable.id,
                debit: 0,
                credit: partnerFinal,
            });

            await this.prisma.partner.update({
                where: { id: share.partnerId },
                data: {
                    totalProfit: { increment: partnerFinal },
                },
            });
        }

        if (totalOrgCut > 0) {
            journalLines.push({
                accountId: profitAccount.id,
                debit: totalOrgCut,
                credit: 0,
            });
            journalLines.push({
                accountId: companySharesAccount.id,
                debit: 0,
                credit: totalOrgCut,
            });
        }

        const journal = await this.journalService.createJournal({
            reference: `EXT-INV-DIST-${id}`,
            sourceType: 'EXTERNAL_PROFIT',
            sourceId: id,
            type: 'GENERAL',
            description: `توزيع أرباح الاستثمار الخارجي رقم ${id}`,
            lines: journalLines,
        });

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, userId);
        }

        await this.prisma.externalInvestment.update({
            where: { id },
            data: { isDistributed: true },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'ExternalInvestment',
                action: 'UPDATE',
                description: `تم توزيع أرباح الاستثمار الخارجي رقم ${id} - إجمالي الربح: ${profit}`,
            },
        });

        return { message: 'تم توزيع الأرباح بنجاح', totalProfit: profit, totalOrgCut };
    }

    async reverseDistribution(id: number, userId: number) {
        const record = await this.prisma.externalInvestment.findUnique({
            where: { id },
            include: {
                partnerShares: {
                    include: {
                        partner: {
                            include: { AccountPayable: true },
                        },
                    },
                },
            },
        });

        if (!record) throw new NotFoundException('Record not found');
        if (!record.isDistributed) throw new BadRequestException('لم يتم توزيع الأرباح بعد');
        if (record.profit === null || record.profit === undefined) throw new BadRequestException('لا يوجد ربح لعكسه');

        const distributionJournal = await this.prisma.journalHeader.findFirst({
            where: {
                reference: `EXT-INV-DIST-${id}`,
                sourceType: 'EXTERNAL_PROFIT',
                sourceId: id,
            },
        });

        if (!distributionJournal) throw new NotFoundException('لم يتم العثور على قيد التوزيع');
        if (distributionJournal.status === 'CANCELLED') throw new BadRequestException('تم إلغاء قيد التوزيع مسبقاً');

        if (distributionJournal.status === 'POSTED') {
            await this.journalService.unpostJournal(userId, distributionJournal.id);
        }

        await this.prisma.journalLine.deleteMany({
            where: { journalId: distributionJournal.id },
        });

        await this.prisma.journalHeader.delete({
            where: { id: distributionJournal.id },
        });

        const profit = record.profit;

        for (const share of record.partnerShares) {
            const rawProfitShare = (profit * share.sharePercent) / 100;
            const orgCut = (rawProfitShare * share.orgProfitPercent) / 100;
            const partnerFinal = rawProfitShare - orgCut;

            await this.prisma.partner.update({
                where: { id: share.partnerId },
                data: {
                    totalProfit: { decrement: partnerFinal },
                },
            });
        }

        await this.prisma.externalInvestment.update({
            where: { id },
            data: { isDistributed: false },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'ExternalInvestment',
                action: 'UPDATE',
                description: `تم عكس توزيع أرباح الاستثمار الخارجي رقم ${id} - إجمالي الربح: ${profit}`,
            },
        });

        return { message: 'تم عكس التوزيع بنجاح', totalProfit: profit };
    }

    async deleteRecord(id: number, userId: number) {
        const record = await this.prisma.externalInvestment.findUnique({
            where: { id },
        });

        if (!record) throw new NotFoundException('Record not found');
        if (record.isDistributed) throw new BadRequestException('لا يمكن حذف سجل تم توزيع أرباحه - قم بعكس التوزيع أولاً');

        const withdrawJournal = await this.prisma.journalHeader.findFirst({
            where: {
                reference: `EXT-INV-${id}`,
                sourceType: 'EXTERNAL_PROFIT',
                sourceId: id,
            },
        });

        if (withdrawJournal?.status === 'POSTED') {
            await this.journalService.unpostJournal(userId, withdrawJournal.id);
        }

        await this.prisma.journalLine.deleteMany({
            where: { journalId: withdrawJournal?.id },
        });

        await this.prisma.journalHeader.delete({
            where: { id: withdrawJournal?.id },
        });

        if (record.status === 'CLOSED') {
            const returnJournal = await this.prisma.journalHeader.findFirst({
                where: {
                    reference: `EXT-INV-RETURN-${id}`,
                    sourceType: 'EXTERNAL_PROFIT',
                    sourceId: id,
                },
            });

            if (returnJournal?.status === 'POSTED') {
                await this.journalService.unpostJournal(userId, returnJournal.id);
            }

            await this.prisma.journalLine.deleteMany({
                where: { journalId: returnJournal?.id },
            });

            await this.prisma.journalHeader.delete({
                where: { id: returnJournal?.id },
            });
        }

        await this.prisma.externalInvestmentPartnerShare.deleteMany({
            where: { externalInvestmentId: id },
        });

        await this.prisma.externalInvestment.delete({
            where: { id },
        });

        await this.prisma.auditLog.create({
            data: {
                userId,
                screen: 'ExternalInvestment',
                action: 'DELETE',
                description: `تم حذف سجل الاستثمار الخارجي رقم ${id} - المبلغ: ${record.amount} - الحالة عند الحذف: ${record.status}`,
            },
        });

        return { message: 'تم حذف السجل بنجاح' };
    }
}