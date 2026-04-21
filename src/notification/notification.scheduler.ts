import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { ClientStatusService } from '../client/client-status.service';
import { PaymentStatus, TemplateType, NotificationType, LoanStatus } from '@prisma/client';

@Injectable()
export class NotificationScheduler {
    private readonly logger = new Logger(NotificationScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
        private readonly clientStatusService: ClientStatusService,
    ) {}

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
    }

    private async updateClientStatus(clientId: number) {
        await this.clientStatusService.updateClientStatus(clientId);
    }


    @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Riyadh' })
    async handleDailyNotifications() {
        const now = new Date();

        const todayUtc = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0, 0, 0, 0
        ));


        const threeDaysAheadUtc = new Date(todayUtc);
        threeDaysAheadUtc.setUTCDate(todayUtc.getUTCDate() + 3);

        const nextDayAfterTargetUtc = new Date(threeDaysAheadUtc);
        nextDayAfterTargetUtc.setUTCDate(threeDaysAheadUtc.getUTCDate() + 1);

        const upcomingRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: threeDaysAheadUtc, lt: nextDayAfterTargetUtc },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });


        for (const repayment of upcomingRepayments) {

            const loan = repayment.loan;
            if (!loan) {
                this.logger.warn(`Loan not found for repayment ${repayment.id}`);
                continue;
            }
            if (loan.status === LoanStatus.PENDING) {
                this.logger.warn(`Loan ${loan.id} is pending, skipping notification`);
                continue;
            }
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
            try {
                const loan = repayment.loan;
                if (!loan) {
                    this.logger.warn(`Loan not found for repayment ${repayment.id}`);
                    continue;
                }
                if (loan.status === LoanStatus.PENDING) {
                    this.logger.warn(`Loan ${loan.id} is pending, skipping notification`);
                    continue;
                }

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
            } catch (err) {
                this.logger.error(`Error processing dueToday repayment ${repayment.id}: ${err}`, err);
            }
        }


        const overdueRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { lt: todayUtc },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of overdueRepayments) {
            try {
                const loan = repayment.loan;
                if (!loan) {
                    this.logger.warn(`Loan not found for repayment ${repayment.id}`);
                    continue;
                }
                if (loan.status === LoanStatus.PENDING) {
                    this.logger.warn(`Loan ${loan.id} is pending, skipping notification`);
                    continue;
                }

                await this.prisma.repayment.update({
                    where: { id: repayment.id },
                    data: { status: PaymentStatus.OVERDUE },
                });

                await this.updateClientStatus(repayment.clientId);

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
            } catch (err) {
                this.logger.error(`Error processing overdue repayment ${repayment.id}: ${err}`, err);
            }
        }
    }


    @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: 'Asia/Riyadh' })
    async sendScheduledTelegramMessages() {
        const nowUtc = new Date();
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

        const BATCH_SIZE = 5;
        for (let i = 0; i < dueNotifications.length; i += BATCH_SIZE) {
            const batch = dueNotifications.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async (notif) => {
                    try {
                        if (!notif.client?.telegramChatId || !notif.repayment) return;

                        const loan = notif.loan;
                        if (!loan) {
                            this.logger.warn(`Loan not found for notification ${notif.id}`);
                            await this.prisma.notification.delete({ where: { id: notif.id } });
                            return;
                        }
                        if (loan.status === LoanStatus.PENDING) {
                            this.logger.warn(`Loan ${loan.id} is pending, skipping notification ${notif.id}`);
                            await this.prisma.notification.delete({ where: { id: notif.id } });
                            return;
                        }

                        if (notif.repayment.status === 'PAID') {
                            await this.prisma.notification.delete({ where: { id: notif.id } });
                            return;
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
                        } else {
                            await this.prisma.notification.delete({ where: { id: notif.id } });
                        }
                    } catch (err) {
                        this.logger.error(`Error processing scheduled notification ${notif.id}: ${err}`, err);
                    }
                }),
            );
        }
    }
}