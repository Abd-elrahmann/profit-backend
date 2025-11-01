import { Module } from '@nestjs/common';
import { RepaymentService } from './repayment.service';
import { RepaymentController } from './repayment.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { NotificationService } from '../notification/notification.service';
import { WhatsappService } from 'src/notification/api/whatsapp.service';
import { TelegramService } from 'src/notification/api/telegram.service';

@Module({
    controllers: [RepaymentController],
    providers: [RepaymentService, PrismaService, JournalService , NotificationService , WhatsappService , TelegramService]
})
export class RepaymentModule { }
