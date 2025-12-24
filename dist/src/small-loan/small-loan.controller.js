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
exports.SmallLoanController = void 0;
const common_1 = require("@nestjs/common");
const small_loan_service_1 = require("./small-loan.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let SmallLoanController = class SmallLoanController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(req, body) {
        return this.service.create(body, req.user.id);
    }
    findAll(page, status, limit, clientName) {
        return this.service.findAll(page, limit, status, clientName);
    }
    pay(req, id, body) {
        return this.service.pay(id, body, req.user.id);
    }
    delete(req, id) {
        return this.service.delete(id, req.user.id);
    }
    async updateLoan(req, id, body) {
        return this.service.update(id, body, req.user.id);
    }
};
exports.SmallLoanController = SmallLoanController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('loans', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SmallLoanController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(":page"),
    (0, permissions_decorator_1.Permissions)('loans', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('clientName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Number, String]),
    __metadata("design:returntype", void 0)
], SmallLoanController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('pay/:id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], SmallLoanController.prototype, "pay", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], SmallLoanController.prototype, "delete", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('loans', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], SmallLoanController.prototype, "updateLoan", null);
exports.SmallLoanController = SmallLoanController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('small-loans'),
    __metadata("design:paramtypes", [small_loan_service_1.SmallLoanService])
], SmallLoanController);
//# sourceMappingURL=small-loan.controller.js.map