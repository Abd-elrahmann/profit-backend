import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalService } from '../journal/journal.service';
import { JournalSourceType } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class PartnerLossService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    async getLosses(page: number = 1, limit: number = 10, search?: string) {
        const safePage = page > 0 ? page : 1;
        const safeLimit = limit > 0 ? limit : 10;

        const skip = (safePage - 1) * safeLimit;

        const where: Prisma.PartnerLossWhereInput = search
            ? {
                partner: {
                    is: {
                        name: {
                            contains: search,
                            mode: 'insensitive',
                        },
                    },
                },
            }
            : {};

        const [losses, total] = await Promise.all([
            this.prisma.partnerLoss.findMany({
                where,
                include: {
                    partner: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                skip,
                take: safeLimit,
            }),
            this.prisma.partnerLoss.count({ where }),
        ]);

        return {
            Pages: Math.ceil(total / safeLimit),
            CurrentPage: safePage,
            limit: safeLimit,
            count: total,
            losses,
        };
    }

    async payLoss(lossId: number, amount: number, bankId: number, currentUser: number) {
        const loss = await this.prisma.partnerLoss.findUnique({
            where: { id: lossId },
        });

        if (!loss) throw new NotFoundException('Loss record not found');

        if (amount <= 0)
            throw new BadRequestException('المبلغ يجب أن يكون أكبر من صفر');

        const remaining = new Decimal(loss.amount).minus(loss.paidAmount || 0);

        if (new Decimal(amount).gt(remaining)) {
            throw new BadRequestException('المبلغ أكبر من قيمة الخسارة');
        }

        const bank = await this.prisma.bANK_accounts.findUnique({
            where: { id: bankId },
        });

        if (!bank?.accountId)
            throw new BadRequestException('حساب البنك غير موجود');

        const account = await this.prisma.account.findUnique({
            where: { id: bank.accountId },
        });

        if (!account)
            throw new NotFoundException('Account not found');

        if (new Decimal(account.balance).lt(amount)) {
            throw new BadRequestException('الرصيد غير كافي');
        }

        const newPaidAmount = new Decimal(loss.paidAmount || 0).plus(amount);
        const paid = newPaidAmount.gte(loss.amount);

        const partner = await this.prisma.partner.findUnique({
            where: { id: loss.partnerId },
            select: { name: true },
        });

        if (!partner) {
            throw new NotFoundException('Partner not found');
        }

        const bankAccountRecord = await this.prisma.bANK_accounts.findUnique({
            where: { id: bankId },
            select: { accountId: true, name: true },
        });

        const lossAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOSSES' },
        });

        if (!lossAccount)
            throw new BadRequestException('حساب الخسائر غير موجود');

        let journalLines = [] as any[];

        journalLines = [
            {
                accountId: lossAccount.id,
                debit: Number(amount),
                credit: 0,
                description: `سداد خسارة الشريك ${partner.name}`,
            },
            {
                accountId: bank.accountId,
                debit: 0,
                credit: Number(amount),
                description: `صرف من ${bankAccountRecord?.name}`,
            },
        ];

        const count = await this.prisma.journalHeader.count({
            where: {
                sourceType: JournalSourceType.LOSSES,
                sourceId: lossId,
            },
        });

        const reference = `LOSS-PAY-${lossId}-${count + 1}`;

        const journal = await this.journalService.createJournal(
            {
                reference: reference,
                description: `سداد خسارة الشريك ${partner.name} بمبلغ ${amount}`,
                type: 'GENERAL',
                sourceType: JournalSourceType.LOSSES,
                sourceId: lossId,
                lines: journalLines,
            },
            currentUser,
        );

        const autoPostSetting = await this.prisma.settings.findFirst();
        if (autoPostSetting?.autoPost) {
            await this.journalService.postJournal(journal.journal.id, currentUser);
        }

        const updatedLoss = await this.prisma.partnerLoss.update({
            where: { id: lossId },
            data: {
                paidAmount: { increment: Number(amount.toFixed(2)) },
                isPaid: paid,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'PartnerLoss',
                action: 'PAY',
                description: `تم سداد مبلغ ${amount} من خسارة رقم ${lossId}`,
            },
        });

        return {
            message: 'تم سداد الخسارة بنجاح',
            loss: updatedLoss,
        };
    }

    async reversePayLoss(lossId: number, currentUser: number) {
        const loss = await this.prisma.partnerLoss.findUnique({
            where: { id: lossId },
        });

        if (!loss) throw new NotFoundException('Loss record not found');

        const journals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: 'LOSSES',
                sourceId: lossId,
                status: 'POSTED',
            },
            include: {
                lines: true,
            },
        });

        if (!journals.length) {
            throw new BadRequestException('لا يوجد قيود لسحبها');
        }

        for (const journal of journals) {
            const autoPostSetting = await this.prisma.settings.findFirst();
            if (autoPostSetting?.autoPost) {
                await this.journalService.unpostJournal(currentUser, journal.id);
            }

            await this.prisma.journalLine.deleteMany({
                where: { journalId: journal.id },
            });

            await this.prisma.journalHeader.delete({
                where: { id: journal.id },
            });
        }

        const updatedLoss = await this.prisma.partnerLoss.update({
            where: { id: lossId },
            data: {
                paidAmount: 0,
                isPaid: false,
            },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'PartnerLoss',
                action: 'POST',
                description: `تم إلغاء سداد الخسارة رقم ${lossId}`,
            },
        });

        return {
            message: 'تم إلغاء السداد بنجاح',
            loss: updatedLoss,
        };
    }
}