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
exports.RolesController = void 0;
const common_1 = require("@nestjs/common");
const roles_service_1 = require("./roles.service");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let RolesController = class RolesController {
    rolesService;
    constructor(rolesService) {
        this.rolesService = rolesService;
    }
    createRole(req, body) {
        return this.rolesService.createRole(req.user.id, body);
    }
    getRoles(id, name) {
        return this.rolesService.getRoles({
            id: id ? Number(id) : undefined,
            name,
        });
    }
    getUserPermissions(req) {
        return this.rolesService.getUserPermissions(req.user.id);
    }
    updateRole(req, id, body) {
        return this.rolesService.updateRole(id, req.user.id, body);
    }
    deleteRole(req, id) {
        return this.rolesService.deleteRole(req.user.id, id);
    }
    async getDashboardPermissions(id) {
        return this.rolesService.getDashboardPermissions(id);
    }
    async addDashboardPermissions(req, id, body) {
        return this.rolesService.addDashboardPermissions(req.user.id, id, body.permissions);
    }
};
exports.RolesController = RolesController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('roles', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "createRole", null);
__decorate([
    (0, common_1.Get)(),
    (0, permissions_decorator_1.Permissions)('roles', 'canView'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "getRoles", null);
__decorate([
    (0, common_1.Get)('permissions'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "getUserPermissions", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('roles', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('roles', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], RolesController.prototype, "deleteRole", null);
__decorate([
    (0, common_1.Get)(':id/dashboard-permissions'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RolesController.prototype, "getDashboardPermissions", null);
__decorate([
    (0, common_1.Post)(':id/dashboard-permissions'),
    (0, permissions_decorator_1.Permissions)('roles', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object]),
    __metadata("design:returntype", Promise)
], RolesController.prototype, "addDashboardPermissions", null);
exports.RolesController = RolesController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('roles'),
    __metadata("design:paramtypes", [roles_service_1.RolesService])
], RolesController);
//# sourceMappingURL=roles.controller.js.map