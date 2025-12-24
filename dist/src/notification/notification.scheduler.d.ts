import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';
export declare class NotificationScheduler {
    private readonly prisma;
    private readonly notificationService;
    private readonly logger;
    constructor(prisma: PrismaService, notificationService: NotificationService);
    private createScheduledTelegramNotification;
    private updateClientStatus;
    handleDailyNotifications(): Promise<void>;
    sendScheduledTelegramMessages(): Promise<void>;
}
