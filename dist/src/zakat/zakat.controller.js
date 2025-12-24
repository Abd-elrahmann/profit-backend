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
exports.ZakatController = void 0;
const common_1 = require("@nestjs/common");
const zakat_service_1 = require("./zakat.service");
const zakat_scheduler_1 = require("./zakat.scheduler");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
let ZakatController = class ZakatController {
    zakatService;
    zakatScheduler;
    constructor(zakatService, zakatScheduler) {
        this.zakatService = zakatService;
        this.zakatScheduler = zakatScheduler;
    }
    async summary(partnerId, year) {
        const partnerIdNum = parseInt(partnerId, 10);
        if (isNaN(partnerIdNum)) {
            throw new common_1.BadRequestException('Invalid partner ID');
        }
        const yearNum = year ? parseInt(year, 10) : undefined;
        if (year) {
            if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
                throw new common_1.BadRequestException('Invalid year. Year must be between 2000 and 2100');
            }
        }
        return this.zakatService.getPartnerZakatSummary(partnerIdNum, yearNum);
    }
    async summaryAll(year, page, limit) {
        const yearNum = parseInt(year, 10);
        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
            throw new common_1.BadRequestException('Invalid year. Year must be between 2000 and 2100');
        }
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : undefined;
        if (page && (isNaN(pageNum) || pageNum < 1)) {
            throw new common_1.BadRequestException('Invalid page number');
        }
        if (limit && (isNaN(limitNum) || limitNum < 1)) {
            throw new common_1.BadRequestException('Invalid limit. Limit must be greater than 0');
        }
        return this.zakatService.getYearlyAllPartners(yearNum, pageNum, limitNum);
    }
    async withdrawZakat(amount, req) {
        return this.zakatService.withdrawZakat(amount, req.user.id);
    }
    async zakatAccountReport(month) {
        if (month) {
            const [year, monthNum] = month.split('-').map(Number);
            if (isNaN(year) ||
                isNaN(monthNum) ||
                monthNum < 1 ||
                monthNum > 12) {
                throw new common_1.BadRequestException('Invalid month format. Use YYYY-MM');
            }
        }
        return this.zakatService.getZakatAccountReport(month);
    }
    async testMonthly() {
        await this.zakatScheduler.runMonthlyZakat();
        return { message: 'Monthly zakat job executed successfully' };
    }
    async testYearEnd() {
        await this.zakatScheduler.runYearEndZakatSettlement();
        return { message: 'Year-end zakat job executed successfully' };
    }
    async runNextYearZakatAccruals() {
        await this.zakatScheduler.runNextYearZakatAccruals();
        return { message: 'Next year zakat accruals job executed successfully' };
    }
};
exports.ZakatController = ZakatController;
__decorate([
    (0, common_1.Get)('partner/:partnerId'),
    (0, permissions_decorator_1.Permissions)('zakat', 'canView'),
    __param(0, (0, common_1.Param)('partnerId')),
    __param(1, (0, common_1.Query)('year')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('year/:year'),
    (0, permissions_decorator_1.Permissions)('zakat', 'canView'),
    __param(0, (0, common_1.Param)('year')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "summaryAll", null);
__decorate([
    (0, common_1.Post)('withdraw'),
    (0, permissions_decorator_1.Permissions)('zakat', 'canPost'),
    __param(0, (0, common_1.Body)('amount')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "withdrawZakat", null);
__decorate([
    (0, common_1.Get)('account'),
    (0, permissions_decorator_1.Permissions)('zakat', 'canView'),
    __param(0, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "zakatAccountReport", null);
__decorate([
    (0, common_1.Get)('test/monthly'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "testMonthly", null);
__decorate([
    (0, common_1.Get)('test/year-end'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "testYearEnd", null);
__decorate([
    (0, common_1.Get)('test/next-year-accruals'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ZakatController.prototype, "runNextYearZakatAccruals", null);
exports.ZakatController = ZakatController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('zakat'),
    __metadata("design:paramtypes", [zakat_service_1.ZakatService,
        zakat_scheduler_1.ZakatSchedulerService])
], ZakatController);
//# sourceMappingURL=zakat.controller.js.map