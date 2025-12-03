"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationModule = void 0;
const common_1 = require("@nestjs/common");
const notification_service_1 = require("./notification.service");
const notification_controller_1 = require("./notification.controller");
const prisma_service_1 = require("../prisma/prisma.service");
const notification_scheduler_1 = require("./notification.scheduler");
const whatsapp_service_1 = require("./api/whatsapp.service");
const telegram_service_1 = require("./api/telegram.service");
const telegram_controller_1 = require("./api/telegram.controller");
const notification_test_controller_1 = require("./notification-test.controller");
let NotificationModule = class NotificationModule {
};
exports.NotificationModule = NotificationModule;
exports.NotificationModule = NotificationModule = __decorate([
    (0, common_1.Module)({
        controllers: [notification_controller_1.NotificationController, telegram_controller_1.TelegramController, notification_test_controller_1.NotificationTestController],
        providers: [notification_service_1.NotificationService, prisma_service_1.PrismaService, notification_scheduler_1.NotificationScheduler, whatsapp_service_1.WhatsappService, telegram_service_1.TelegramService],
        exports: [notification_service_1.NotificationService, whatsapp_service_1.WhatsappService, telegram_service_1.TelegramService],
    })
], NotificationModule);
//# sourceMappingURL=notification.module.js.map