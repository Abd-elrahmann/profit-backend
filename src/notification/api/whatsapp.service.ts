import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    private readonly baseUrl = process.env.WHATSAPP_API_URL;
    private readonly apiKey = process.env.WHATSAPP_API_KEY;

    async sendMessage(to: string, message: string) {
        if (!to || !message) {
            this.logger.warn('Missing recipient or message content.');
            return;
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/messages`,
                {
                    recipient_type: 'individual',
                    to,
                    type: 'text',
                    text: { body: message },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.apiKey}`,
                    },
                }
            );

            this.logger.log(`✅ WhatsApp message sent to ${to}`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`❌ Failed to send WhatsApp message: ${error.message}`);
            throw new Error('Failed to send WhatsApp message');
        }
    }
}