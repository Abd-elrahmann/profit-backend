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
exports.RepaymentController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const repayment_service_1 = require("./repayment.service");
const repayment_dto_1 = require("./dto/repayment.dto");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let RepaymentController = class RepaymentController {
    repaymentService;
    constructor(repaymentService) {
        this.repaymentService = repaymentService;
    }
    getRepaymentById(id) {
        return this.repaymentService.getRepaymentById(id);
    }
    uploadReceipts(req, id, files) {
        return this.repaymentService.uploadReceipts(req.user.id, id, files);
    }
    approveRepayment(req, id, dto) {
        return this.repaymentService.approveRepayment(req.user.id, id, dto);
    }
    rejectRepayment(req, id, dto) {
        return this.repaymentService.rejectRepayment(req.user.id, id, dto);
    }
    postponeRepayment(req, id, dto) {
        return this.repaymentService.postponeRepayment(req.user.id, id, dto);
    }
    uploadPaymentProof(req, id, file) {
        return this.repaymentService.uploadPaymentProof(req.user.id, id, file);
    }
    async markAsPartialPaid(req, id, paidAmount) {
        return this.repaymentService.markAsPartialPaid(req.user.id, Number(id), Number(paidAmount));
    }
    async markAsEarlyPaid(req, id, earlyPaymentDiscount) {
        const result = await this.repaymentService.markLoanAsEarlyPaid(id, earlyPaymentDiscount, req.user.id);
        return result;
    }
    async approveMany(req, body) {
        const dto = { notes: body.notes };
        return this.repaymentService.approveMany(req.user.id, body.ids, dto);
    }
    async rejectMany(req, body) {
        const dto = { notes: body.notes };
        return this.repaymentService.rejectMany(req.user.id, body.ids, dto);
    }
};
exports.RepaymentController = RepaymentController;
__decorate([
    (0, common_1.Get)('repayment/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "getRepaymentById", null);
__decorate([
    (0, common_1.Post)('upload/:id'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Array]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "uploadReceipts", null);
__decorate([
    (0, common_1.Patch)('approve/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, repayment_dto_1.RepaymentDto]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "approveRepayment", null);
__decorate([
    (0, common_1.Patch)('reject/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, repayment_dto_1.RepaymentDto]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "rejectRepayment", null);
__decorate([
    (0, common_1.Patch)('postpone/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, repayment_dto_1.RepaymentDto]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "postponeRepayment", null);
__decorate([
    (0, common_1.Post)('PaymentProof/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], RepaymentController.prototype, "uploadPaymentProof", null);
__decorate([
    (0, common_1.Patch)('partial-paid/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('paidAmount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number]),
    __metadata("design:returntype", Promise)
], RepaymentController.prototype, "markAsPartialPaid", null);
__decorate([
    (0, common_1.Patch)('early-pay/:id'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('discount')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], RepaymentController.prototype, "markAsEarlyPaid", null);
__decorate([
    (0, common_1.Post)('approve-many'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RepaymentController.prototype, "approveMany", null);
__decorate([
    (0, common_1.Post)('reject-many'),
    (0, permissions_decorator_1.Permissions)('repayments', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RepaymentController.prototype, "rejectMany", null);
exports.RepaymentController = RepaymentController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('repayments'),
    __metadata("design:paramtypes", [repayment_service_1.RepaymentService])
], RepaymentController);
//# sourceMappingURL=repayment.controller.js.map