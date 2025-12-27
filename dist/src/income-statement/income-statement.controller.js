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
exports.IncomeStatementController = void 0;
const common_1 = require("@nestjs/common");
const income_statement_service_1 = require("./income-statement.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let IncomeStatementController = class IncomeStatementController {
    incomeService;
    constructor(incomeService) {
        this.incomeService = incomeService;
    }
    async getIncomeStatement(from, to, month, year, periodId) {
        return this.incomeService.getIncomeStatement({
            fromDate: from,
            toDate: to,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
            periodId: periodId ? Number(periodId) : undefined,
        });
    }
};
exports.IncomeStatementController = IncomeStatementController;
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('income-statement', 'canView'),
    __param(0, (0, common_1.Query)('from')),
    __param(1, (0, common_1.Query)('to')),
    __param(2, (0, common_1.Query)('month')),
    __param(3, (0, common_1.Query)('year')),
    __param(4, (0, common_1.Query)('periodId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], IncomeStatementController.prototype, "getIncomeStatement", null);
exports.IncomeStatementController = IncomeStatementController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('income-statement'),
    __metadata("design:paramtypes", [income_statement_service_1.IncomeStatementService])
], IncomeStatementController);
//# sourceMappingURL=income-statement.controller.js.map