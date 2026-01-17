import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    private readonly baseUrl = process.env.WHATSAPP_API_URL;
    private readonly apiKey = process.env.WHATSAPP_API_KEY;

    async sendMessage(to: string, message: string) {
        if (!to || !message) {
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

            return response.data;
        } catch (error: any) {
            throw new Error('Failed to send WhatsApp message');
        }
    }
}