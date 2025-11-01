import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { PaymentStatus , TemplateType } from '@prisma/client';

@Injectable()
export class NotificationScheduler {
    private readonly logger = new Logger(NotificationScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
    ) { }

    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async handleDailyReminders() {
        this.logger.log('Running daily repayment reminders...');

        const today = new Date();
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(today.getDate() + 3);

        // reminders for upcoming repayments within the next 3 days
        const upcomingRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: {
                    gte: today,
                    lte: threeDaysFromNow,
                },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of upcomingRepayments) {
            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'WHATSAPP',
            });
        }

        // الأقساط المتأخرة (تاريخها فات ولسه PENDING)
        const overdueRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { lt: today },
                status: PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });

        for (const repayment of overdueRepayments) {
            await this.notificationService.sendNotification({
                templateType: TemplateType.REPAYMENT_LATE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'WHATSAPP',
            });
        }

        this.logger.log('✅ Repayment notifications processed.');
    }
}