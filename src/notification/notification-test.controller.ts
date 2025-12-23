import { Controller, Get } from '@nestjs/common';
import { NotificationScheduler } from './notification.scheduler';

@Controller('test-notification')
export class NotificationTestController {
  constructor(private readonly scheduler: NotificationScheduler) {}

  @Get('daily')
  async runDaily() {
    await this.scheduler.handleDailyNotifications();
    return { status: 'Daily notification scheduler executed manually ✅' };
  }

  @Get('telegram')
  async runTelegram() {
    await this.scheduler.sendScheduledTelegramMessages();
    return { status: 'Scheduled Telegram messages sent ✅' };
  }
}