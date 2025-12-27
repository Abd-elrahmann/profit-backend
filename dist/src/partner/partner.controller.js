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
exports.PartnerController = void 0;
const common_1 = require("@nestjs/common");
const partner_service_1 = require("./partner.service");
const partner_dto_1 = require("./dto/partner.dto");
const platform_express_1 = require("@nestjs/platform-express");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let PartnerController = class PartnerController {
    partnerService;
    constructor(partnerService) {
        this.partnerService = partnerService;
    }
    create(req, dto) {
        return this.partnerService.createPartner(req.user.id, dto);
    }
    update(req, id, dto) {
        return this.partnerService.updatePartner(req.user.id, id, dto);
    }
    delete(req, id) {
        return this.partnerService.deletePartner(req.user.id, id);
    }
    getAll(page, limit, name, nationalId, status, withdrawingStatus) {
        return this.partnerService.getAllPartners(page, {
            limit,
            name,
            nationalId,
            status,
            withdrawingStatus,
        });
    }
    getPartnerById(id) {
        return this.partnerService.getPartnerById(id);
    }
    uploadMudarabahFile(req, id, file) {
        return this.partnerService.uploadMudarabahFile(req.user.id, id, file);
    }
    async createTransaction(req, partnerId, dto) {
        const currentUser = req.user.id;
        return await this.partnerService.createPartnerTransaction(currentUser, partnerId, dto);
    }
    async deleteTransaction(req, id) {
        const currentUser = req.user.id;
        return await this.partnerService.deletePartnerTransaction(currentUser, id);
    }
    async getTransactions(partnerId, page, limit, type, search, startDate, endDate) {
        return await this.partnerService.getPartnerTransactions(partnerId, page, {
            limit: limit ? Number(limit) : 10,
            type,
            search,
            startDate,
            endDate,
        });
    }
};
exports.PartnerController = PartnerController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('partners', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, partner_dto_1.CreatePartnerDto]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, partner_dto_1.UpdatePartnerDto]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "delete", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    (0, permissions_decorator_1.Permissions)('partners', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('name')),
    __param(3, (0, common_1.Query)('nationalId')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('withdrawingStatus')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "getPartnerById", null);
__decorate([
    (0, common_1.Post)('upload/:id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canUpdate'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], PartnerController.prototype, "uploadMudarabahFile", null);
__decorate([
    (0, common_1.Post)('transaction/:id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], PartnerController.prototype, "createTransaction", null);
__decorate([
    (0, common_1.Delete)('transaction/:id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], PartnerController.prototype, "deleteTransaction", null);
__decorate([
    (0, common_1.Get)('transaction/:id/:page'),
    (0, permissions_decorator_1.Permissions)('partners', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('search')),
    __param(5, (0, common_1.Query)('startDate')),
    __param(6, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PartnerController.prototype, "getTransactions", null);
exports.PartnerController = PartnerController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('partners'),
    __metadata("design:paramtypes", [partner_service_1.PartnerService])
], PartnerController);
//# sourceMappingURL=partner.controller.js.map