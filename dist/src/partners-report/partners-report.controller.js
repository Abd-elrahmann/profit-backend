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
exports.PartnersReportController = void 0;
const common_1 = require("@nestjs/common");
const partners_report_service_1 = require("./partners-report.service");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
let PartnersReportController = class PartnersReportController {
    service;
    constructor(service) {
        this.service = service;
    }
    getAllPartners(page, limit) {
        return this.service.getAllPartners(page, limit);
    }
    getPartnerDetails(id) {
        return this.service.getPartnerDetails(id);
    }
};
exports.PartnersReportController = PartnersReportController;
__decorate([
    (0, common_1.Get)(':page'),
    (0, permissions_decorator_1.Permissions)('partners', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", void 0)
], PartnersReportController.prototype, "getAllPartners", null);
__decorate([
    (0, common_1.Get)('partner/:id'),
    (0, permissions_decorator_1.Permissions)('partners', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], PartnersReportController.prototype, "getPartnerDetails", null);
exports.PartnersReportController = PartnersReportController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('partner-report'),
    __metadata("design:paramtypes", [partners_report_service_1.PartnersReportService])
], PartnersReportController);
//# sourceMappingURL=partners-report.controller.js.map