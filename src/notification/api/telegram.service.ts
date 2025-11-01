import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TelegramService {
    private readonly logger = new Logger(TelegramService.name);
    private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Send a plain text message or with optional reply_markup (buttons)
    async sendMessage(chatId: string, message: string, extra?: any) {
        if (!chatId || !message) {
            this.logger.warn('Missing chatId or message');
            return;
        }

        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const payload = {
                    chat_id: chatId,
                    text: message,
                    parse_mode: 'HTML',
                    ...extra, // include optional buttons or markup
                };

                const response = await axios.post(url, payload);
                this.logger.log(`✅ Telegram message sent to ${chatId}`);
                return response.data;
            } catch (error: any) {
                if (axios.isAxiosError(error)) {
                    this.logger.error(
                        `❌ Attempt ${attempt} failed for chat ${chatId}: ${error.message} | Response: ${JSON.stringify(error.response?.data)}`
                    );
                } else {
                    this.logger.error(`❌ Attempt ${attempt} failed for chat ${chatId}: ${error}`);
                }

                if (attempt < 3) {
                    await new Promise(res => setTimeout(res, 500));
                } else {
                    throw new Error(`Failed to send Telegram message to ${chatId} after 3 attempts`);
                }
            }
        }
    }
}