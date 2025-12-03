"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TelegramController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramController = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const telegram_service_1 = require("./telegram.service");
let TelegramController = TelegramController_1 = class TelegramController {
    prisma;
    telegramService;
    logger = new common_1.Logger(TelegramController_1.name);
    constructor(prisma, telegramService) {
        this.prisma = prisma;
        this.telegramService = telegramService;
    }
    async handleUpdate(update) {
        const message = update?.message;
        if (!message || !message.chat)
            return { ok: true };
        const chatId = message.chat.id.toString();
        const text = message.text?.toLowerCase() || '';
        const userPhone = message.contact?.phone_number || null;
        if (text === '/start') {
            this.logger.log(`📩 New Telegram Start from chat ${chatId}`);
            await this.telegramService.sendMessage(chatId, '👋 أهلاً بك! لمزامنة رقم هاتفك، اضغط على الزر لمشاركة رقمك.', {
                reply_markup: {
                    keyboard: [
                        [{ text: 'شارك رقمي', request_contact: true }]
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            });
        }
        if (userPhone) {
            const client = await this.prisma.client.findFirst({ where: { phone: userPhone } });
            if (client) {
                await this.prisma.client.update({
                    where: { id: client.id },
                    data: { telegramChatId: chatId },
                });
                this.logger.log(`✅ Telegram chat linked for client: ${client.name}`);
                await this.telegramService.sendMessage(chatId, '✅ تم ربط حسابك بنجاح!');
            }
            else {
                await this.telegramService.sendMessage(chatId, '⚠️ رقم الهاتف غير مسجل في النظام.');
            }
        }
        return { ok: true };
    }
};
exports.TelegramController = TelegramController;
__decorate([
    (0, common_1.Post)('webhook'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TelegramController.prototype, "handleUpdate", null);
exports.TelegramController = TelegramController = TelegramController_1 = __decorate([
    (0, common_1.Controller)('telegram'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        telegram_service_1.TelegramService])
], TelegramController);
//# sourceMappingURL=telegram.controller.js.map