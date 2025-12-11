import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class PartnerWithdrawService {
    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    async withdrawPartner(partnerId: number, months: number = 1, userId: number) {

        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                LoanPartnerShare: true,
            },
        });

        if (!partner) throw new NotFoundException('المستثمر غير موجود');
        if (partner.WithdrawingStatus !== 'ACTIVE')
            throw new BadRequestException('لا يمكن تنفيذ الانسحاب لهذا المستثمر الآن');

        // const defaultedLoans = await this.prisma.loan.findMany({
        //     where: { status: 'DEFAULTED' },
        //     include: { LoanPartnerShare: true },
        // });

        let partnerDefaultShare = 0;

        // for (const loan of defaultedLoans) {
        //     const share = loan.LoanPartnerShare.find(s => s.partnerId === partner.id);
        //     if (share) {
        //         partnerDefaultShare += (loan.totalAmount * share.sharePercent) / 100;
        //     }
        // }

        const remainingCapital = partner.totalAmount - partnerDefaultShare;

        await this.prisma.partner.update({
            where: { id: partnerId },
            data: {
                isActive: false,
                joinDistribute: false,
                WithdrawingStatus: 'WITHDRAWING',
                isFrozen: true,
                totalAmount: remainingCapital,
            },
        });

        const lossAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOSSES' },
        });

        if (!lossAccount) throw new BadRequestException('حساب الخسائر غير موجود');

        const journalDefault = await this.journalService.createJournal(
            {
                reference: `DEFAULT-${partnerId}-${Date.now()}`,
                description: `خصم نصيب المساهم (${partner.name}) من خسائر التعثر`,
                type: 'GENERAL',
                sourceType: 'PARTNER_WITHDRAWING',
                sourceId: partnerId,
                lines: [
                    {
                        accountId: partner.accountEquityId,
                        debit: partnerDefaultShare,
                        credit: 0,
                        description: 'خصم من رأس مال المساهم',
                    },
                    {
                        accountId: lossAccount.id,
                        debit: 0,
                        credit: partnerDefaultShare,
                        description: 'إثبات خسائر التعثر',
                    },
                ],
            },
            userId,
        );

        const savingsAmount = partner.AccountSaving.balance

        const cashAccount = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });

        if (!cashAccount)
            throw new BadRequestException('BANK account not found');

        if (savingsAmount > 0) {
            await this.journalService.createJournal(
                {
                    reference: `SAVING-${partnerId}-${Date.now()}`,
                    description: `صرف مدخرات المساهم ${partner.name}`,
                    type: 'GENERAL',
                    sourceType: 'PARTNER_WITHDRAWING',
                    sourceId: partnerId,
                    lines: [
                        {
                            accountId: partner.accountSavingId,
                            debit: savingsAmount,
                            credit: 0,
                            description: 'خصم المدخرات',
                        },
                        {
                            accountId: cashAccount.id,
                            debit: 0,
                            credit: savingsAmount,
                            description: 'صرف المدخرات',
                        },
                    ],
                },
                userId,
            );
        }

        const installment = remainingCapital / months;
        const schedule = [] as any;
        const startDate = new Date();

        for (let i = 1; i <= months; i++) {
            const payDate = new Date(startDate);
            payDate.setMonth(startDate.getMonth() + i);

            const s = await this.prisma.partnerWithdrawalSchedule.create({
                data: {
                    partnerId,
                    year: payDate.getFullYear(),
                    month: payDate.getMonth() + 1,
                    amount: installment,
                },
            });

            schedule.push(s);
        }

        const withdrawal = await this.prisma.partnerWithdrawal.create({
            data: {
                partnerId,
                totalCapital: partner.totalAmount,
                defaultShare: partnerDefaultShare,
                remainingCapital,
                savingAmount: savingsAmount,
            },
        });

        return {
            message: 'تم طلب انسحاب المساهم بنجاح',
            withdrawal,
            schedule,
            savingsAmount,
            partnerDefaultShare,
            remainingCapital,
            journalDefault,
        };
    }

    async getWithdrawalDetails(partnerId: number) {
        const partner = await this.prisma.partner.findUnique({
            where: { id: partnerId },
            include: {
                AccountSaving: true,
                PartnerWithdrawal: true,
            },
        });

        if (!partner) throw new NotFoundException("المستثمر غير موجود");

        if (!partner.PartnerWithdrawal)
            throw new NotFoundException("لا يوجد طلب انسحاب لهذا المساهم");

        const withdrawal = await this.prisma.partnerWithdrawal.findFirst({
            where: { partnerId },
        });

        const schedule = await this.prisma.partnerWithdrawalSchedule.findMany({
            where: { partnerId },
            orderBy: { id: "asc" },
        });

        const journals = await this.prisma.journalHeader.findMany({
            where: {
                sourceType: "PARTNER_WITHDRAWING",
                sourceId: partnerId,
            },
            include: {
                lines: true,
            },
            orderBy: { createdAt: "asc" },
        });

        const savingsAmount = partner.AccountSaving?.balance ?? 0;

        return {
            partner: {
                id: partner.id,
                name: partner.name,
                totalCapital: partner.totalAmount,
                savings: savingsAmount,
                withdrawingStatus: partner.WithdrawingStatus,
                isFrozen: partner.isFrozen,
            },

            withdrawal,
            schedule,
            journals,
        };
    }
}