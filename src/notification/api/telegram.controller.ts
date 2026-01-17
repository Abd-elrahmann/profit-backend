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


        if (text === '/start') {

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


        if (userPhone) {
            const client = await this.prisma.client.findFirst({ where: { phone: userPhone } });
            if (client) {
                await this.prisma.client.update({
                    where: { id: client.id },
                    data: { telegramChatId: chatId },
                });

                await this.telegramService.sendMessage(chatId, '✅ تم ربط حسابك بنجاح!');
            } else {

                await this.telegramService.sendMessage(chatId, '⚠️ رقم الهاتف غير مسجل في النظام.');
            }
        }

        return { ok: true };
    }
}