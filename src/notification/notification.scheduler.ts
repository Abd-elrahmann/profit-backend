import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { PaymentStatus, TemplateType, NotificationType, LoanStatus } from '@prisma/client';

@Injectable()
export class NotificationScheduler {
    private readonly logger = new Logger(NotificationScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
    ) { }

    private async createScheduledTelegramNotification(
        repaymentId: number,
        templateType: TemplateType,
        sendDate: Date,
    ) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id: repaymentId },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment || !repayment.loan?.client) return;

        await this.prisma.notification.create({
            data: {
                title:
                    templateType === TemplateType.REPAYMENT_LATE
                        ? 'Repayment Overdue Reminder'
                        : 'Upcoming Repayment Reminder',
                message:
                    templateType === TemplateType.REPAYMENT_LATE
                        ? 'You have overdue repayments pending. Please take action immediately.'
                        : 'Your loan repayment is due soon.',
                type:
                    templateType === TemplateType.REPAYMENT_LATE
                        ? NotificationType.REPAYMENT_LATE
                        : NotificationType.REPAYMENT_DUE,
                clientId: repayment.loan.client.id,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
                scheduledAt: sendDate,
            },
        });

        this.logger.log(
            `🕓 Telegram notification scheduled for repayment ${repaymentId} at ${sendDate.toISOString()}`,
        );
    }

    // Runs every day at 9 AM local time
    @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Riyadh' })
    async handleDailyNotifications() {
        this.logger.log('📅 Starting daily notification scheduler...');

        // --- Normalize all comparisons to UTC ---
        const now = new Date();

        const todayUtc = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0, 0, 0, 0
        ));

        // Calculate target date for "3 days before due
        const threeDaysAheadUtc = new Date(todayUtc);
        threeDaysAheadUtc.setUTCDate(todayUtc.getUTCDate() + 3);

        const nextDayAfterTargetUtc = new Date(threeDaysAheadUtc);
        nextDayAfterTargetUtc.setUTCDate(threeDaysAheadUtc.getUTCDate() + 1);

        this.logger.log(
            `UTC window today: ${todayUtc.toISOString()} | 3-days target: ${threeDaysAheadUtc.toISOString()}`,
        );

        // Repayments due exactly 3 days from now
        const upcomingRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: threeDaysAheadUtc, lt: nextDayAfterTargetUtc },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });


        for (const repayment of upcomingRepayments) {

            const loan = repayment.loan;
            if (!loan) throw new NotFoundException('Loan not found');

            if (loan.status === LoanStatus.PENDING)
                throw new BadRequestException('loan is pending');

            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });

            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);

            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_DUE,
                telegramDate,
            );
        }

        // Repayments due today (UTC)
        const startOfDayUtc = new Date(todayUtc);
        const endOfDayUtc = new Date(todayUtc);
        endOfDayUtc.setUTCHours(23, 59, 59, 999);

        const dueToday = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: startOfDayUtc, lte: endOfDayUtc },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of dueToday) {

            const loan = repayment.loan;
            if (!loan) throw new NotFoundException('Loan not found');

            if (loan.status === LoanStatus.PENDING)
                throw new BadRequestException('loan is pending');

            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });

            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);

            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_DUE,
                telegramDate,
            );
        }

        // Overdue repayments
        const overdueRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { lt: todayUtc },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of overdueRepayments) {

            const loan = repayment.loan;
            if (!loan) throw new NotFoundException('Loan not found');

            if (loan.status === LoanStatus.PENDING)
                throw new BadRequestException('loan is pending');

            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { status: PaymentStatus.OVERDUE },
            });

            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_LATE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });

            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);

            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_LATE,
                telegramDate,
            );
        }

        this.logger.log('✅ Daily notification scheduler finished.');
    }

    // Checks every 5 minutes for scheduled Telegram messages
    @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: 'Asia/Riyadh' })
    async sendScheduledTelegramMessages() {
        const nowUtc = new Date();
        this.logger.log(`⏰ Checking for due Telegram notifications at ${nowUtc.toISOString()} ...`);

        const dueNotifications = await this.prisma.notification.findMany({
            where: {
                channel: 'TELEGRAM',
                sentAt: null,
                scheduledAt: { lte: nowUtc },
            },
            include: {
                client: true,
                repayment: true,
                loan: true,
            },
        });

        for (const notif of dueNotifications) {
            if (!notif.client?.telegramChatId || !notif.repayment) continue;

            const loan = notif.loan;
            if (!loan) throw new NotFoundException('Loan not found');

            if (loan.status === LoanStatus.PENDING)
                throw new BadRequestException('loan is pending');

            if (notif.repayment.status === 'PAID') {
                this.logger.log(
                    `⚠️ Skipping notification for repayment ${notif.repaymentId} (already PAID)`,
                );
                await this.prisma.notification.delete({ where: { id: notif.id } });
                continue;
            }

            if (notif.repayment.status === 'PENDING' || notif.repayment.status === 'OVERDUE') {
                await this.notificationService.sendNotification({
                    templateType:
                        notif.type === NotificationType.REPAYMENT_LATE
                            ? TemplateType.REPAYMENT_LATE
                            : TemplateType.REPAYMENT_DUE,
                    clientId: notif.clientId!,
                    loanId: notif.loanId!,
                    repaymentId: notif.repaymentId!,
                    channel: 'TELEGRAM',
                });

                await this.prisma.notification.delete({ where: { id: notif.id } });

                this.logger.log(
                    `✅ Telegram notification sent & record deleted for client ${notif.clientId}`,
                );
            } else {
                this.logger.log(
                    `⚠️ Skipping notification for repayment ${notif.repaymentId} (status: ${notif.repayment.status})`,
                );
                await this.prisma.notification.delete({ where: { id: notif.id } });
            }
        }
    }
}