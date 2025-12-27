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
exports.PartnerWithdrawController = void 0;
const common_1 = require("@nestjs/common");
const partner_withdraw_service_1 = require("./partner-withdraw.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const platform_express_1 = require("@nestjs/platform-express");
let PartnerWithdrawController = class PartnerWithdrawController {
    service;
    constructor(service) {
        this.service = service;
    }
    withdrawPartner(req, partnerId, amount) {
        return this.service.withdrawPartner(partnerId, amount, req.user.id);
    }
    async previewDefaultShare(partnerId) {
        return this.service.previewPartnerDefaultShare(Number(partnerId));
    }
    async updateWithdrawalAmount(req, partnerId, amount) {
        return this.service.updateWithdrawalMonthlyAmount(req.user.id, partnerId, amount);
    }
    getWithdrawalDetails(partnerId) {
        return this.service.getWithdrawalDetails(partnerId);
    }
    approveWithdrawalPayment(req, scheduleId) {
        return this.service.approveWithdrawalPayment(req.user.id, scheduleId);
    }
    rejectWithdrawalPayment(req, scheduleId) {
        return this.service.rejectWithdrawalPayment(req.user.id, scheduleId);
    }
    async partialPayment(req, scheduleId, paidAmount) {
        const currentUser = req.user.id;
        return this.service.partialPayWithdrawal(currentUser, scheduleId, paidAmount);
    }
    getAllWithdrawingPartners(page, limit = 10) {
        return this.service.getAllWithdrawingPartners(page, +limit);
    }
    uploadWithdrawalReceipt(req, partnerId, file) {
        return this.service.uploadWithdrawalReceipt(req.user.id, partnerId, file);
    }
};
exports.PartnerWithdrawController = PartnerWithdrawController;
__decorate([
    (0, common_1.Post)(':partnerId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('partnerId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('amount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "withdrawPartner", null);
__decorate([
    (0, common_1.Get)('preview/:partnerId'),
    __param(0, (0, common_1.Param)('partnerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PartnerWithdrawController.prototype, "previewDefaultShare", null);
__decorate([
    (0, common_1.Patch)(':partnerId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('partnerId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('amount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], PartnerWithdrawController.prototype, "updateWithdrawalAmount", null);
__decorate([
    (0, common_1.Get)('details/:partnerId'),
    __param(0, (0, common_1.Param)('partnerId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "getWithdrawalDetails", null);
__decorate([
    (0, common_1.Post)('approve/:scheduleId'),
    (0, permissions_decorator_1.Permissions)('partners-withdraw', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('scheduleId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "approveWithdrawalPayment", null);
__decorate([
    (0, common_1.Post)('reject/:scheduleId'),
    (0, permissions_decorator_1.Permissions)('partners-withdraw', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('scheduleId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "rejectWithdrawalPayment", null);
__decorate([
    (0, common_1.Post)('partial/:scheduleId'),
    (0, permissions_decorator_1.Permissions)('partners-withdraw', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('scheduleId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('paidAmount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], PartnerWithdrawController.prototype, "partialPayment", null);
__decorate([
    (0, common_1.Get)('all-withdrawing/:page'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "getAllWithdrawingPartners", null);
__decorate([
    (0, common_1.Post)('upload-receipt/:partnerId'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('partnerId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], PartnerWithdrawController.prototype, "uploadWithdrawalReceipt", null);
exports.PartnerWithdrawController = PartnerWithdrawController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('partner-withdraw'),
    __metadata("design:paramtypes", [partner_withdraw_service_1.PartnerWithdrawService])
], PartnerWithdrawController);
//# sourceMappingURL=partner-withdraw.controller.js.map