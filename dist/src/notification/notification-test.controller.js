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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationTestController = void 0;
const common_1 = require("@nestjs/common");
const notification_scheduler_1 = require("./notification.scheduler");
let NotificationTestController = class NotificationTestController {
    scheduler;
    constructor(scheduler) {
        this.scheduler = scheduler;
    }
    async runDaily() {
        await this.scheduler.handleDailyNotifications();
        return { status: 'Daily notification scheduler executed manually ✅' };
    }
    async runTelegram() {
        await this.scheduler.sendScheduledTelegramMessages();
        return { status: 'Scheduled Telegram messages sent ✅' };
    }
};
exports.NotificationTestController = NotificationTestController;
__decorate([
    (0, common_1.Get)('daily'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationTestController.prototype, "runDaily", null);
__decorate([
    (0, common_1.Get)('telegram'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationTestController.prototype, "runTelegram", null);
exports.NotificationTestController = NotificationTestController = __decorate([
    (0, common_1.Controller)('test-notification'),
    __metadata("design:paramtypes", [notification_scheduler_1.NotificationScheduler])
], NotificationTestController);
//# sourceMappingURL=notification-test.controller.js.map