import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
import { PaymentStatus, TemplateType } from '@prisma/client';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

   
   // Run daily at 9AM:
   // Send repayment due reminders (3 days before due)
   // Send late repayment alerts
 
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDailyNotifications() {
    this.logger.log('📅 Starting daily notification scheduler...');

    const today = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);

    // ----------------------------------------
    // 1️⃣ Repayments due within 3 days
    // ----------------------------------------
    const upcomingRepayments = await this.prisma.repayment.findMany({
      where: {
        dueDate: {
          gte: today,
          lte: threeDaysFromNow,
        },
        status: PaymentStatus.PENDING,
      },
      include: {
        loan: { include: { client: true } },
      },
    });

    for (const repayment of upcomingRepayments) {
      await this.notificationService.sendNotification({
        templateType: TemplateType.REPAYMENT_DUE,
        clientId: repayment.loan.clientId,
        loanId: repayment.loanId,
        repaymentId: repayment.id,
        channel: 'WHATSAPP',
      });
      this.logger.log(
        `📨 Sent REPAYMENT_DUE to client ${repayment.loan.client.name}`,
      );
    }

    // ----------------------------------------
    // 2️⃣ Overdue repayments
    // ----------------------------------------
    const overdueRepayments = await this.prisma.repayment.findMany({
      where: {
        dueDate: { lt: today },
        status: PaymentStatus.PENDING,
      },
      include: {
        loan: { include: { client: true } },
      },
    });

    for (const repayment of overdueRepayments) {
      await this.notificationService.sendNotification({
        templateType: TemplateType.REPAYMENT_LATE,
        clientId: repayment.loan.clientId,
        loanId: repayment.loanId,
        repaymentId: repayment.id,
        channel: 'WHATSAPP',
      });
      this.logger.log(
        `📨 Sent REPAYMENT_LATE to client ${repayment.loan.client.name}`,
      );
    }

    // ----------------------------------------
    // 3️⃣ Payments approved (status = PAID)
    // ----------------------------------------
    const approvedPayments = await this.prisma.repayment.findMany({
      where: {
        status: PaymentStatus.PAID,
        reviewStatus: 'APPROVED',
        paymentDate: {
          gte: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        },
      },
      include: {
        loan: { include: { client: true } },
      },
    });

    for (const repayment of approvedPayments) {
      await this.notificationService.sendNotification({
        templateType: TemplateType.PAYMENT_APPROVED,
        clientId: repayment.loan.clientId,
        loanId: repayment.loanId,
        repaymentId: repayment.id,
        channel: 'WHATSAPP',
      });
      this.logger.log(
        `✅ Sent PAYMENT_APPROVED to client ${repayment.loan.client.name}`,
      );
    }

    // ----------------------------------------
    // 4️⃣ Payments rejected
    // ----------------------------------------
    const rejectedPayments = await this.prisma.repayment.findMany({
      where: {
        reviewStatus: 'REJECTED',
        paymentDate: {
          gte: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
        },
      },
      include: {
        loan: { include: { client: true } },
      },
    });

    for (const repayment of rejectedPayments) {
      await this.notificationService.sendNotification({
        templateType: TemplateType.PAYMENT_REJECTED,
        clientId: repayment.loan.clientId,
        loanId: repayment.loanId,
        repaymentId: repayment.id,
        channel: 'WHATSAPP',
      });
      this.logger.log(
        `❌ Sent PAYMENT_REJECTED to client ${repayment.loan.client.name}`,
      );
    }

    this.logger.log('✅ Daily notification scheduler finished.');
  }
}