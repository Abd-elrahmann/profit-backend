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
exports.LoansController = void 0;
const common_1 = require("@nestjs/common");
const loans_service_1 = require("./loans.service");
const loan_dto_1 = require("./dto/loan.dto");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const platform_express_1 = require("@nestjs/platform-express");
let LoansController = class LoansController {
    loansService;
    constructor(loansService) {
        this.loansService = loansService;
    }
    create(req, dto) {
        return this.loansService.createLoan(req.user.id, dto);
    }
    activate(req, id) {
        return this.loansService.activateLoan(id, req.user.id);
    }
    deactivateLoan(req, id) {
        return this.loansService.deactivateLoan(req.user.id, id);
    }
    getAll(page, limit = 10, status, code, clientName, clientId) {
        return this.loansService.getAllLoans(page, +limit, { status, code, clientName, clientId });
    }
    getById(id, page, limit = 10) {
        return this.loansService.getLoanById(id, page, +limit);
    }
    getByIdwithoutpage(id) {
        return this.loansService.getLoanById(id, 1, 10);
    }
    update(req, id, dto) {
        return this.loansService.updateLoan(req.user.id, id, dto);
    }
    delete(req, id) {
        return this.loansService.deleteLoan(req.user.id, id);
    }
    async uploadDebtAcknowledgment(req, id, file, body) {
        return this.loansService.uploadDebtAcknowledgmentFile(req.user.id, id, file, body);
    }
    async uploadPromissoryNote(req, id, file, body) {
        return this.loansService.uploadPromissoryNoteFile(req.user.id, id, file, body);
    }
    async saveContractNumbers(req, id, body) {
        return this.loansService.saveContractNumbers(req.user.id, id, body);
    }
    async uploadSettlementFile(req, id, file) {
        return this.loansService.uploadSettlementFile(req.user.id, id, file);
    }
    async convertClient(req, loanId, fromClientId, toClientId, kafeelId) {
        return this.loansService.convertLoanClient(fromClientId, toClientId, loanId, kafeelId, req.user.id);
    }
};
exports.LoansController = LoansController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('loans', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, loan_dto_1.CreateLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/activate'),
    (0, permissions_decorator_1.Permissions)('loans', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "activate", null);
__decorate([
    (0, common_1.Patch)(':id/deactivate'),
    (0, permissions_decorator_1.Permissions)('loans', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "deactivateLoan", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    (0, permissions_decorator_1.Permissions)('loans', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('code')),
    __param(4, (0, common_1.Query)('clientName')),
    __param(5, (0, common_1.Query)('clientId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, String, String, String, Number]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)(':id/:page'),
    (0, permissions_decorator_1.Permissions)('loans', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Object]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "getById", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "getByIdwithoutpage", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, loan_dto_1.UpdateLoanDto]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], LoansController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/upload-debt-acknowledgment'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, Object]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "uploadDebtAcknowledgment", null);
__decorate([
    (0, common_1.Post)(':id/upload-promissory-note'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, Object]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "uploadPromissoryNote", null);
__decorate([
    (0, common_1.Post)(':id/save-contract-numbers'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "saveContractNumbers", null);
__decorate([
    (0, common_1.Post)(':id/upload-Settlement'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "uploadSettlementFile", null);
__decorate([
    (0, common_1.Patch)('convert-client/:loanId'),
    (0, permissions_decorator_1.Permissions)('loans', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('loanId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)('fromClientId', common_1.ParseIntPipe)),
    __param(3, (0, common_1.Body)('toClientId', common_1.ParseIntPipe)),
    __param(4, (0, common_1.Body)('kafeelId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number, Number, Number]),
    __metadata("design:returntype", Promise)
], LoansController.prototype, "convertClient", null);
exports.LoansController = LoansController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('loans'),
    __metadata("design:paramtypes", [loans_service_1.LoansService])
], LoansController);
//# sourceMappingURL=loans.controller.js.map