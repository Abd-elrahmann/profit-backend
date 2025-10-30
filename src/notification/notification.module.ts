import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationScheduler } from './notification.scheduler';
import { WhatsappService } from './api/whatsapp.service';
import { TelegramService } from './api/telegram.service';
import { TelegramController } from './api/telegram.controller';

@Module({
  controllers: [NotificationController , TelegramController],
  providers: [NotificationService, PrismaService, NotificationScheduler, WhatsappService, TelegramService],
  exports: [NotificationService],
})
export class NotificationModule { }