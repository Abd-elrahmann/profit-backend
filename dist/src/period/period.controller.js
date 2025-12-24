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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodController = void 0;
const common_1 = require("@nestjs/common");
const period_service_1 = require("./period.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let PeriodController = class PeriodController {
    periodService;
    constructor(periodService) {
        this.periodService = periodService;
    }
    async closePeriod(req, id) {
        return this.periodService.closePeriod(+id, req.user.id);
    }
    async reverseClosePeriod(id, req) {
        const userId = req.user.id;
        return this.periodService.reversePeriodClosing(Number(id), userId);
    }
    async getPeriodDetails(periodId) {
        return this.periodService.getPeriodDetails(periodId);
    }
    async getAllPeriods(page, filters) {
        return this.periodService.getAllPeriods(Number(page) || 1, filters);
    }
    async compare(periodId1, periodId2) {
        return this.periodService.comparePeriods(periodId1, periodId2);
    }
};
exports.PeriodController = PeriodController;
__decorate([
    (0, common_1.Post)(':id/close'),
    (0, permissions_decorator_1.Permissions)('period', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], PeriodController.prototype, "closePeriod", null);
__decorate([
    (0, common_1.Patch)('reverse-close/:id'),
    (0, permissions_decorator_1.Permissions)('period', 'canPost'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], PeriodController.prototype, "reverseClosePeriod", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('period', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PeriodController.prototype, "getPeriodDetails", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    (0, permissions_decorator_1.Permissions)('period', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], PeriodController.prototype, "getAllPeriods", null);
__decorate([
    (0, common_1.Post)('compare'),
    __param(0, (0, common_1.Body)('periodId1', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('periodId2', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], PeriodController.prototype, "compare", null);
exports.PeriodController = PeriodController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('periods'),
    __metadata("design:paramtypes", [period_service_1.PeriodService])
], PeriodController);
//# sourceMappingURL=period.controller.js.map