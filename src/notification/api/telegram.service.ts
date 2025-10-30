import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;

    async sendMessage(chatId: string, message: string) {
        if (!chatId || !message) {
            this.logger.warn('Missing chatId or message');
            return;
        }

        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            const response = await axios.post(url, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML',
            });

            this.logger.log(`✅ Telegram message sent to ${chatId}`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`❌ Failed to send Telegram message: ${error.message}`);
            throw new Error('Failed to send Telegram message');
        }
    }
}