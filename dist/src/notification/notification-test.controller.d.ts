import { NotificationScheduler } from './notification.scheduler';
export declare class NotificationTestController {
    private readonly scheduler;
    constructor(scheduler: NotificationScheduler);
    runDaily(): Promise<{
        status: string;
    }>;
    runTelegram(): Promise<{
        status: string;
    }>;
}
