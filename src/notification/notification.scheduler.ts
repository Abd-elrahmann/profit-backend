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
    }

    private async updateClientStatus(clientId: number) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId },
            include: { repayments: true },
        });

        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' as any },
            });
            return;
        }

        const allRepayments = loans.flatMap(l => l.repayments);
        const nowUtc = new Date();

        const fullyPaidStatuses = ['PAID', 'EARLY_PAID', 'COMPLETED' , 'PARTIAL_PAID'];

        const unpaidRepayments = allRepayments.filter(r => !fullyPaidStatuses.includes(r.status));
        const overdueRepayments = unpaidRepayments.filter(r => r.dueDate < nowUtc);

        const hasSixOverdueRepayments = overdueRepayments.length >= 6;


        const paidRepayments = allRepayments.filter(
            r => fullyPaidStatuses.includes(r.status) && r.paymentDate
        );

        let hasSixMonthsDelay = false;

        if (paidRepayments.length > 0) {
            const lastPaidDate = paidRepayments
                .map(r => r.paymentDate!)
                .sort((a, b) => b.getTime() - a.getTime())[0];

            const sixMonthsAfterLastPaid = new Date(lastPaidDate);
            sixMonthsAfterLastPaid.setUTCMonth(sixMonthsAfterLastPaid.getUTCMonth() + 6);

            hasSixMonthsDelay = nowUtc >= sixMonthsAfterLastPaid;

        } else if (unpaidRepayments.length > 0) {
            const firstDueDate = unpaidRepayments
                .map(r => r.dueDate)
                .sort((a, b) => a.getTime() - b.getTime())[0];

            const sixMonthsAfterFirstDue = new Date(firstDueDate);
            sixMonthsAfterFirstDue.setUTCMonth(sixMonthsAfterFirstDue.getUTCMonth() + 6);

            hasSixMonthsDelay = nowUtc >= sixMonthsAfterFirstDue;
        }

        let newStatus: any = 'نشط';

        if (hasSixOverdueRepayments || hasSixMonthsDelay) {
            newStatus = 'متعثر';
        } else if (unpaidRepayments.length === 0) {
            newStatus = 'منتهي';
        }

        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });

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

        for (const notif of dueNotifications) {
            if (!notif.client?.telegramChatId || !notif.repayment) continue;

            const loan = notif.loan;
            if (!loan) throw new NotFoundException('Loan not found');

            if (loan.status === LoanStatus.PENDING)
                throw new BadRequestException('loan is pending');

            if (notif.repayment.status === 'PAID') {
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

            } else {
                await this.prisma.notification.delete({ where: { id: notif.id } });
            }
        }
    }
}