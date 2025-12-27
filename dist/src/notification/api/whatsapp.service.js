"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WhatsappService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsappService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let WhatsappService = WhatsappService_1 = class WhatsappService {
    logger = new common_1.Logger(WhatsappService_1.name);
    baseUrl = process.env.WHATSAPP_API_URL;
    apiKey = process.env.WHATSAPP_API_KEY;
    async sendMessage(to, message) {
        if (!to || !message) {
            this.logger.warn('Missing recipient or message content.');
            return;
        }
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/messages`, {
                recipient_type: 'individual',
                to,
                type: 'text',
                text: { body: message },
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            this.logger.log(`✅ WhatsApp message sent to ${to}`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`❌ Failed to send WhatsApp message: ${error.message}`);
            throw new Error('Failed to send WhatsApp message');
        }
    }
};
exports.WhatsappService = WhatsappService;
exports.WhatsappService = WhatsappService = WhatsappService_1 = __decorate([
    (0, common_1.Injectable)()
], WhatsappService);
//# sourceMappingURL=whatsapp.service.js.map