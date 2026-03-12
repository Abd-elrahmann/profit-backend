import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;


    async sendMessage(chatId: string, message: string, extra?: any) {
        if (!chatId || !message) {
            return;
        }

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const payload = {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                    ...extra,
                };

                const response = await axios.post(url, payload, { timeout: 10000 });
                return response.data;
            } catch (error: any) {
                if (attempt < 3) {
                    await new Promise((r) => setTimeout(r, 500 * attempt));
                } else {
                    throw new Error(`Failed to send Telegram message to ${chatId} after 3 attempts`);
                }
            }
        }
    }
}