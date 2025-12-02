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
exports.SavingController = void 0;
const common_1 = require("@nestjs/common");
const saving_service_1 = require("./saving.service");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
let SavingController = class SavingController {
    savingService;
    constructor(savingService) {
        this.savingService = savingService;
    }
    getPartnerSummary(id) {
        return this.savingService.getPartnerSavingSummary(id);
    }
    getAccountReport(month) {
        return this.savingService.getSavingAccountReport(month);
    }
    getAllPartners(page, limit, name, nationalId, phone) {
        return this.savingService.getAllPartnerSavings(page, { limit, name, nationalId, phone });
    }
};
exports.SavingController = SavingController;
__decorate([
    (0, common_1.Get)('partner/:id'),
    (0, permissions_decorator_1.Permissions)('saving', 'canView'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], SavingController.prototype, "getPartnerSummary", null);
__decorate([
    (0, common_1.Get)('account-report'),
    (0, permissions_decorator_1.Permissions)('saving', 'canView'),
    __param(0, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SavingController.prototype, "getAccountReport", null);
__decorate([
    (0, common_1.Get)(':page'),
    (0, permissions_decorator_1.Permissions)('saving', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('name')),
    __param(3, (0, common_1.Query)('nationalId')),
    __param(4, (0, common_1.Query)('phone')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String]),
    __metadata("design:returntype", void 0)
], SavingController.prototype, "getAllPartners", null);
exports.SavingController = SavingController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('saving'),
    __metadata("design:paramtypes", [saving_service_1.SavingService])
], SavingController);
//# sourceMappingURL=saving.controller.js.map