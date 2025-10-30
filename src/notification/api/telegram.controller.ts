import { Controller, Post, Body } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('telegram')
export class TelegramController {
    constructor(private readonly prisma: PrismaService) { }

    // Webhook endpoint
    @Post('webhook')
    async handleUpdate(@Body() update: any) {
        // Telegram sends update object containing message/chat info
        const message = update?.message;
        if (!message || !message.chat) return { ok: true };

        const chatId = message.chat.id.toString();
        const userPhone = message.contact?.phone_number || null;
        const text = message.text?.toLowerCase() || '';

        if (text === '/start') {
            console.log(`📩 New Telegram Start from chat ${chatId}`);
        }

        if (userPhone) {
            const client = await this.prisma.client.findFirst({
                where: { phone: userPhone },
            });

            if (client) {
                await this.prisma.client.update({
                    where: { id: client.id },
                    data: { telegramChatId: chatId },
                });

                console.log(`Telegram chat linked for client: ${client.name}`);
            }
        }
        return { ok: true };
    }
}