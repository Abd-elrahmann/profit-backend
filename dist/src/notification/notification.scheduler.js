"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NotificationScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const notification_service_1 = require("./notification.service");
const client_1 = require("@prisma/client");
let NotificationScheduler = NotificationScheduler_1 = class NotificationScheduler {
    prisma;
    notificationService;
    logger = new common_1.Logger(NotificationScheduler_1.name);
    constructor(prisma, notificationService) {
        this.prisma = prisma;
        this.notificationService = notificationService;
    }
    async createScheduledTelegramNotification(repaymentId, templateType, sendDate) {
        const repayment = await this.prisma.repayment.findUnique({
            where: { id: repaymentId },
            include: { loan: { include: { client: true } } },
        });
        if (!repayment || !repayment.loan?.client)
            return;
        await this.prisma.notification.create({
            data: {
                title: templateType === client_1.TemplateType.REPAYMENT_LATE
                    ? 'Repayment Overdue Reminder'
                    : 'Upcoming Repayment Reminder',
                message: templateType === client_1.TemplateType.REPAYMENT_LATE
                    ? 'You have overdue repayments pending. Please take action immediately.'
                    : 'Your loan repayment is due soon.',
                type: templateType === client_1.TemplateType.REPAYMENT_LATE
                    ? client_1.NotificationType.REPAYMENT_LATE
                    : client_1.NotificationType.REPAYMENT_DUE,
                clientId: repayment.loan.client.id,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
                scheduledAt: sendDate,
            },
        });
        this.logger.log(`🕓 Telegram notification scheduled for repayment ${repaymentId} at ${sendDate.toISOString()}`);
    }
    async updateClientStatus(clientId) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId },
            include: { repayments: true },
        });
        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' },
            });
            return;
        }
        const allRepayments = loans.flatMap(l => l.repayments);
        const overdue = allRepayments.filter(r => r.status === 'OVERDUE' || (r.status !== 'PAID' && r.dueDate < new Date()));
        const unpaid = allRepayments.filter(r => r.status !== 'PAID');
        let newStatus = 'نشط';
        if (overdue.length > 0) {
            newStatus = 'متعثر';
        }
        else if (unpaid.length === 0) {
            newStatus = 'منتهي';
        }
        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
        this.logger.log(`👤 Client ${clientId} status updated to: ${newStatus}`);
    }
    async handleDailyNotifications() {
        this.logger.log('📅 Starting daily notification scheduler...');
        const now = new Date();
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        const threeDaysAheadUtc = new Date(todayUtc);
        threeDaysAheadUtc.setUTCDate(todayUtc.getUTCDate() + 3);
        const nextDayAfterTargetUtc = new Date(threeDaysAheadUtc);
        nextDayAfterTargetUtc.setUTCDate(threeDaysAheadUtc.getUTCDate() + 1);
        this.logger.log(`UTC window today: ${todayUtc.toISOString()} | 3-days target: ${threeDaysAheadUtc.toISOString()}`);
        const upcomingRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: threeDaysAheadUtc, lt: nextDayAfterTargetUtc },
                status: client_1.PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });
        for (const repayment of upcomingRepayments) {
            const loan = repayment.loan;
            if (!loan)
                throw new common_1.NotFoundException('Loan not found');
            if (loan.status === client_1.LoanStatus.PENDING)
                throw new common_1.BadRequestException('loan is pending');
            await this.notificationService.sendNotification({
                templateType: client_1.TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });
            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);
            await this.createScheduledTelegramNotification(repayment.id, client_1.TemplateType.REPAYMENT_DUE, telegramDate);
        }
        const startOfDayUtc = new Date(todayUtc);
        const endOfDayUtc = new Date(todayUtc);
        endOfDayUtc.setUTCHours(23, 59, 59, 999);
        const dueToday = await this.prisma.repayment.findMany({
            where: {
                dueDate: { gte: startOfDayUtc, lte: endOfDayUtc },
                status: client_1.PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });
        for (const repayment of dueToday) {
            const loan = repayment.loan;
            if (!loan)
                throw new common_1.NotFoundException('Loan not found');
            if (loan.status === client_1.LoanStatus.PENDING)
                throw new common_1.BadRequestException('loan is pending');
            await this.notificationService.sendNotification({
                templateType: client_1.TemplateType.REPAYMENT_DUE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });
            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);
            await this.createScheduledTelegramNotification(repayment.id, client_1.TemplateType.REPAYMENT_DUE, telegramDate);
        }
        const overdueRepayments = await this.prisma.repayment.findMany({
            where: {
                dueDate: { lt: todayUtc },
                status: client_1.PaymentStatus.PENDING,
            },
            include: { loan: { include: { client: true } } },
        });
        for (const repayment of overdueRepayments) {
            const loan = repayment.loan;
            if (!loan)
                throw new common_1.NotFoundException('Loan not found');
            if (loan.status === client_1.LoanStatus.PENDING)
                throw new common_1.BadRequestException('loan is pending');
            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { status: client_1.PaymentStatus.OVERDUE },
            });
            await this.updateClientStatus(repayment.clientId);
            await this.notificationService.sendNotification({
                templateType: client_1.TemplateType.REPAYMENT_LATE,
                clientId: repayment.loan.clientId,
                loanId: repayment.loanId,
                repaymentId: repayment.id,
                channel: 'TELEGRAM',
            });
            const telegramDate = new Date(todayUtc);
            telegramDate.setUTCDate(todayUtc.getUTCDate() + 2);
            await this.createScheduledTelegramNotification(repayment.id, client_1.TemplateType.REPAYMENT_LATE, telegramDate);
        }
        this.logger.log('✅ Daily notification scheduler finished.');
    }
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
            if (!notif.client?.telegramChatId || !notif.repayment)
                continue;
            const loan = notif.loan;
            if (!loan)
                throw new common_1.NotFoundException('Loan not found');
            if (loan.status === client_1.LoanStatus.PENDING)
                throw new common_1.BadRequestException('loan is pending');
            if (notif.repayment.status === 'PAID') {
                this.logger.log(`⚠️ Skipping notification for repayment ${notif.repaymentId} (already PAID)`);
                await this.prisma.notification.delete({ where: { id: notif.id } });
                continue;
            }
            if (notif.repayment.status === 'PENDING' || notif.repayment.status === 'OVERDUE') {
                await this.notificationService.sendNotification({
                    templateType: notif.type === client_1.NotificationType.REPAYMENT_LATE
                        ? client_1.TemplateType.REPAYMENT_LATE
                        : client_1.TemplateType.REPAYMENT_DUE,
                    clientId: notif.clientId,
                    loanId: notif.loanId,
                    repaymentId: notif.repaymentId,
                    channel: 'TELEGRAM',
                });
                await this.prisma.notification.delete({ where: { id: notif.id } });
                this.logger.log(`✅ Telegram notification sent & record deleted for client ${notif.clientId}`);
            }
            else {
                this.logger.log(`⚠️ Skipping notification for repayment ${notif.repaymentId} (status: ${notif.repayment.status})`);
                await this.prisma.notification.delete({ where: { id: notif.id } });
            }
        }
    }
};
exports.NotificationScheduler = NotificationScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Asia/Riyadh' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationScheduler.prototype, "handleDailyNotifications", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES, { timeZone: 'Asia/Riyadh' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationScheduler.prototype, "sendScheduledTelegramMessages", null);
exports.NotificationScheduler = NotificationScheduler = NotificationScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notification_service_1.NotificationService])
], NotificationScheduler);
//# sourceMappingURL=notification.scheduler.js.map