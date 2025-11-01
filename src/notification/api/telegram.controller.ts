import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
    private readonly logger = new Logger(TelegramController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly telegramService: TelegramService,
    ) { }

    @Post('webhook')
    async handleUpdate(@Body() update: any) {
        const message = update?.message;
        if (!message || !message.chat) return { ok: true };

        const chatId = message.chat.id.toString();
        const text = message.text?.toLowerCase() || '';
        const userPhone = message.contact?.phone_number || null;

        // Handle /start
        if (text === '/start') {
            this.logger.log(`📩 New Telegram Start from chat ${chatId}`);

            // Ask user to share their phone
            await this.telegramService.sendMessage(chatId,
                '👋 أهلاً بك! لمزامنة رقم هاتفك، اضغط على الزر لمشاركة رقمك.',
                {
                    reply_markup: {
                        keyboard: [
                            [{ text: 'شارك رقمي', request_contact: true }]
                        ],
                        resize_keyboard: true,
                        one_time_keyboard: true,
                    },
                }
            );
        }

        // Handle phone number shared by user
        if (userPhone) {
            const client = await this.prisma.client.findFirst({ where: { phone: userPhone } });
            if (client) {
                await this.prisma.client.update({
                    where: { id: client.id },
                    data: { telegramChatId: chatId },
                });
                this.logger.log(`✅ Telegram chat linked for client: ${client.name}`);

                // Optional: send confirmation
                await this.telegramService.sendMessage(chatId, '✅ تم ربط حسابك بنجاح!');
            } else {
                // Optional: handle unknown phone
                await this.telegramService.sendMessage(chatId, '⚠️ رقم الهاتف غير مسجل في النظام.');
            }
        }

        return { ok: true };
    }
}