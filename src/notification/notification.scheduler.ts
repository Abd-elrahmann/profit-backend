import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { PaymentStatus, TemplateType, NotificationType } from '@prisma/client';

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

    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async handleDailyNotifications() {
        this.logger.log('📅 Starting daily notification scheduler...');

        const today = new Date();
        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(today.getDate() + 3);

        // Upcoming repayments in next 3 days
        const upcomingRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: today, lte: threeDaysFromNow },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of upcomingRepayments) {
            // Send WhatsApp immediately
            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'WHATSAPP',
            });

            // Schedule Telegram message 2 days later
            const telegramDate = new Date();
            telegramDate.setDate(today.getDate() + 2);
            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_DUE,
                telegramDate,
            );
        }

        // Repayments due today
        const dueToday = await this.prisma.repayment.findMany({
            where: {
                dueDate: {
                    gte: new Date(today.setHours(0, 0, 0, 0)),
                    lte: new Date(today.setHours(23, 59, 59, 999)),
                },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of dueToday) {
            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'WHATSAPP',
            });

            const telegramDate = new Date();
            telegramDate.setDate(today.getDate() + 2);
            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_DUE,
                telegramDate,
            );
        }

        // Overdue repayments
        const overdueRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { lt: new Date() },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of overdueRepayments) {
            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { status: PaymentStatus.OVERDUE },
            });

            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_LATE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'WHATSAPP',
            });

            const telegramDate = new Date();
            telegramDate.setDate(new Date().getDate() + 2);
            await this.createScheduledTelegramNotification(
                repayment.id,
                TemplateType.REPAYMENT_LATE,
                telegramDate,
            );
        }

        this.logger.log('✅ Daily notification scheduler finished.');
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async sendScheduledTelegramMessages() {
        const now = new Date();
        this.logger.log('⏰ Checking for due Telegram notifications...');

        const dueNotifications = await this.prisma.notification.findMany({
            where: {
                channel: 'TELEGRAM',
                sentAt: null,
                scheduledAt: { lte: now },
            },
            include: { client: true },
        });

        for (const notif of dueNotifications) {
            if (!notif.client?.telegramChatId) continue;

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

            await this.prisma.notification.delete({
                where: { id: notif.id },
            });

            this.logger.log(`✅ Telegram notification sent & scheduled record deleted for client ${notif.clientId}`);
        }
    }
}