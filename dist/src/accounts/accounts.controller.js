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
exports.AccountsController = void 0;
const common_1 = require("@nestjs/common");
const accounts_service_1 = require("./accounts.service");
const accounts_dto_1 = require("./dto/accounts.dto");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let AccountsController = class AccountsController {
    accountsService;
    constructor(accountsService) {
        this.accountsService = accountsService;
    }
    create(dto) {
        return this.accountsService.createAccount(dto);
    }
    update(id, dto) {
        return this.accountsService.updateAccount(id, dto);
    }
    delete(id) {
        return this.accountsService.deleteAccount(id);
    }
    getAllAccounts(page, limit = 10, search) {
        return this.accountsService.getAllAccounts(page, +limit, { search });
    }
    getTree() {
        return this.accountsService.getAccountsTree();
    }
    getBankAccountReport(month) {
        return this.accountsService.getBankAccountReport(month);
    }
    getAccountDetails(id) {
        return this.accountsService.getAccountDetails(id);
    }
    getAccountById(id, page, from, to, limit = '10') {
        return this.accountsService.getAccountById(id, page, {
            from,
            to,
            limit: Number(limit),
        });
    }
};
exports.AccountsController = AccountsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [accounts_dto_1.CreateAccountDto]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, accounts_dto_1.UpdateAccountDto]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "delete", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, String]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "getAllAccounts", null);
__decorate([
    (0, common_1.Get)('tree'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "getTree", null);
__decorate([
    (0, common_1.Get)('bank'),
    (0, permissions_decorator_1.Permissions)('treasury', 'canView'),
    __param(0, (0, common_1.Query)('month')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "getBankAccountReport", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "getAccountDetails", null);
__decorate([
    (0, common_1.Get)(':id/:page'),
    (0, permissions_decorator_1.Permissions)('general-ledger', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, Object]),
    __metadata("design:returntype", void 0)
], AccountsController.prototype, "getAccountById", null);
exports.AccountsController = AccountsController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('accounts'),
    __metadata("design:paramtypes", [accounts_service_1.AccountsService])
], AccountsController);
//# sourceMappingURL=accounts.controller.js.map