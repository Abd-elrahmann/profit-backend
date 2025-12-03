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
exports.JournalController = void 0;
const common_1 = require("@nestjs/common");
const journal_service_1 = require("./journal.service");
const journal_dto_1 = require("./dto/journal.dto");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let JournalController = class JournalController {
    journalService;
    constructor(journalService) {
        this.journalService = journalService;
    }
    create(req, dto) {
        return this.journalService.createJournal(dto, req.user.id);
    }
    update(req, id, dto) {
        return this.journalService.updateJournal(req.user.id, id, dto);
    }
    delete(req, id) {
        return this.journalService.deleteJournal(req.user.id, id);
    }
    getAll(page, limit, search, status, type) {
        return this.journalService.getAllJournals(page, {
            limit: Number(limit) || 10,
            search,
            status,
            type,
        });
    }
    getById(id) {
        return this.journalService.getJournalById(id);
    }
    async postJournal(id, req) {
        const userId = req.user.id;
        return this.journalService.postJournal(id, userId);
    }
    async unpostJournal(req, id) {
        return this.journalService.unpostJournal(req.user.id, id);
    }
};
exports.JournalController = JournalController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('journals', 'canAdd'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, journal_dto_1.CreateJournalDto]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, permissions_decorator_1.Permissions)('journals', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, journal_dto_1.UpdateJournalDto]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('journals', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "delete", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    (0, permissions_decorator_1.Permissions)('journals', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('status')),
    __param(4, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('journals', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], JournalController.prototype, "getById", null);
__decorate([
    (0, common_1.Post)(':id/post'),
    (0, permissions_decorator_1.Permissions)('journals', 'canPost'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], JournalController.prototype, "postJournal", null);
__decorate([
    (0, common_1.Post)(':id/unpost'),
    (0, permissions_decorator_1.Permissions)('journals', 'canPost'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], JournalController.prototype, "unpostJournal", null);
exports.JournalController = JournalController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('journals'),
    __metadata("design:paramtypes", [journal_service_1.JournalService])
], JournalController);
//# sourceMappingURL=journal.controller.js.map