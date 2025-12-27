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
exports.ExpenseController = void 0;
const common_1 = require("@nestjs/common");
const expense_service_1 = require("./expense.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let ExpenseController = class ExpenseController {
    expenseService;
    constructor(expenseService) {
        this.expenseService = expenseService;
    }
    async createJournal(req, body) {
        return this.expenseService.createExpenseJournal(req.user.id, body.expenses);
    }
    async getExpensesAccount(page, limit = 10) {
        return this.expenseService.getExpensesAccountData(page, +limit);
    }
    async getExpensesRecords(page, limit = 10) {
        return this.expenseService.getExpensesRecords(page, +limit);
    }
    async updateExpense(req, journalId, body) {
        return this.expenseService.updateExpense(req.user.id, journalId, body.expenses);
    }
    async deleteExpense(req, journalId) {
        return this.expenseService.deleteExpense(req.user.id, journalId);
    }
    async getUsersForExpenses() {
        return this.expenseService.getUsersForExpenses();
    }
};
exports.ExpenseController = ExpenseController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('expenses', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "createJournal", null);
__decorate([
    (0, common_1.Get)(':page'),
    (0, permissions_decorator_1.Permissions)('expenses', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "getExpensesAccount", null);
__decorate([
    (0, common_1.Get)('records/:page'),
    (0, permissions_decorator_1.Permissions)('expenses', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "getExpensesRecords", null);
__decorate([
    (0, common_1.Patch)(':journalId'),
    (0, permissions_decorator_1.Permissions)('expenses', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('journalId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "updateExpense", null);
__decorate([
    (0, common_1.Delete)(':journalId'),
    (0, permissions_decorator_1.Permissions)('expenses', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('journalId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "deleteExpense", null);
__decorate([
    (0, common_1.Get)('users/list'),
    (0, permissions_decorator_1.Permissions)('expenses', 'canView'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExpenseController.prototype, "getUsersForExpenses", null);
exports.ExpenseController = ExpenseController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('expenses'),
    __metadata("design:paramtypes", [expense_service_1.ExpenseService])
], ExpenseController);
//# sourceMappingURL=expense.controller.js.map