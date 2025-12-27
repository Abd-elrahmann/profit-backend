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
exports.DistributionController = void 0;
const common_1 = require("@nestjs/common");
const distribution_service_1 = require("./distribution.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let DistributionController = class DistributionController {
    distributionService;
    constructor(distributionService) {
        this.distributionService = distributionService;
    }
    async postClosing(req, periodId, savingAmount) {
        const savingAmountInput = savingAmount ? Number(savingAmount) : undefined;
        return this.distributionService.postClosing(Number(periodId), req.user.id, savingAmountInput);
        ;
    }
    async reverseClosing(req, periodId) {
        return this.distributionService.reverseClosing(Number(periodId), req.user.id);
    }
    async getClosedPeriods(periodId) {
        return this.distributionService.getClosedPeriods(periodId);
    }
};
exports.DistributionController = DistributionController;
__decorate([
    (0, common_1.Post)('post/:periodId'),
    (0, permissions_decorator_1.Permissions)('distribution', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('periodId')),
    __param(2, (0, common_1.Body)('savingAmount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number]),
    __metadata("design:returntype", Promise)
], DistributionController.prototype, "postClosing", null);
__decorate([
    (0, common_1.Post)('unpost/:periodId'),
    (0, permissions_decorator_1.Permissions)('distribution', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('periodId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DistributionController.prototype, "reverseClosing", null);
__decorate([
    (0, common_1.Get)('closed-periods'),
    (0, permissions_decorator_1.Permissions)('distribution', 'canView'),
    __param(0, (0, common_1.Query)('periodId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], DistributionController.prototype, "getClosedPeriods", null);
exports.DistributionController = DistributionController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('distribution'),
    __metadata("design:paramtypes", [distribution_service_1.DistributionService])
], DistributionController);
//# sourceMappingURL=distribution.controller.js.map