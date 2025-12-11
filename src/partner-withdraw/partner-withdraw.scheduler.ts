import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Injectable()
export class PartnerWithdrawalScheduler {
    private readonly logger = new Logger(PartnerWithdrawalScheduler.name);

    constructor(
        private prisma: PrismaService,
        private journalService: JournalService,
    ) { }

    // Runs every 1st day of every month at 01:00 AM Riyadh time
    @Cron('0 1 1 * *', {
        timeZone: 'Asia/Riyadh'
    })
    async handleMonthlyWithdrawals() {
        this.logger.log("🔄 Starting monthly partner withdrawal scheduler...");

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const schedules = await this.prisma.partnerWithdrawalSchedule.findMany({
            where: {
                year,
                month,
                isPaid: false,
            },
            include: {
                partner: true,
            }
        });

        if (schedules.length === 0) {
            this.logger.log("✔ No pending withdrawals for this month");
            return;
        }

        this.logger.log(`📌 Found ${schedules.length} pending withdrawals`);

        const cash = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });

        if (!cash) {
            this.logger.error("❌ BANK account not found. Scheduler stopped.");
            return;
        }

        for (const s of schedules) {
            try {
                const journal = await this.journalService.createJournal(
                    {
                        reference: `WITHDRAW-SCH-${s.id}-${Date.now()}`,
                        description: `صرف دفعة انسحاب شهرية للمساهم ${s.partner.name}`,
                        type: 'GENERAL',
                        sourceType: 'PARTNER_WITHDRAWING',
                        sourceId: s.id,
                        lines: [
                            {
                                accountId: s.partner.accountEquityId,
                                debit: s.amount,
                                credit: 0,
                                description: 'خصم من رأس المال للمساهم',
                            },
                            {
                                accountId: cash.id,
                                debit: 0,
                                credit: s.amount,
                                description: 'صرف دفعة السحب',
                            },
                        ],
                    },
                    1
                );

                await this.prisma.partnerWithdrawalSchedule.update({
                    where: { id: s.id },
                    data: {
                        isPaid: true,
                        paidAt: new Date(),
                    },
                });

                this.logger.log(
                    `✔ Withdrawal completed for partner ${s.partner.name}, schedule ${s.id}`
                );

            } catch (err) {
                this.logger.error(
                    `❌ Failed to process schedule ${s.id}: ${err.message}`
                );
            }
        }
        this.logger.log("🏁 Monthly withdrawal processing completed.");
    }
}