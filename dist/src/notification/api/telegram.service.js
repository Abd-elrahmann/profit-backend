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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
let TelegramService = TelegramService_1 = class TelegramService {
    logger = new common_1.Logger(TelegramService_1.name);
    botToken = process.env.TELEGRAM_BOT_TOKEN;
    async sendMessage(chatId, message, extra) {
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
                    ...extra,
                };
                const response = await axios_1.default.post(url, payload);
                this.logger.log(`✅ Telegram message sent to ${chatId}`);
                return response.data;
            }
            catch (error) {
                if (axios_1.default.isAxiosError(error)) {
                    this.logger.error(`❌ Attempt ${attempt} failed for chat ${chatId}: ${error.message} | Response: ${JSON.stringify(error.response?.data)}`);
                }
                else {
                    this.logger.error(`❌ Attempt ${attempt} failed for chat ${chatId}: ${error}`);
                }
                if (attempt < 3) {
                    await new Promise(res => setTimeout(res, 500));
                }
                else {
                    throw new Error(`Failed to send Telegram message to ${chatId} after 3 attempts`);
                }
            }
        }
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)()
], TelegramService);
//# sourceMappingURL=telegram.service.js.map