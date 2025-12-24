"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = __importStar(require("multer"));
const client_service_1 = require("./client.service");
const client_dto_1 = require("./dto/client.dto");
const jwt_guard_1 = require("../auth/strategy/jwt.guard");
const permissions_guard_1 = require("../common/guards/permissions.guard");
const permissions_decorator_1 = require("../common/decorators/permissions.decorator");
let ClientController = class ClientController {
    clientService;
    constructor(clientService) {
        this.clientService = clientService;
    }
    createClient(req, dto, files) {
        const normalizedFiles = {};
        Object.entries(files).forEach(([key, value]) => {
            const cleanKey = key.replace(/\[\d+\]$/, '');
            if (!normalizedFiles[cleanKey])
                normalizedFiles[cleanKey] = [];
            normalizedFiles[cleanKey].push(...value);
        });
        return this.clientService.createClient(req.user.id, dto, normalizedFiles);
    }
    updateClientData(req, id, dto) {
        return this.clientService.updateClientData(req.user.id, id, dto);
    }
    updateKafeelData(req, kafeelId, dto, files) {
        return this.clientService.updateKafeelData(req.user.id, kafeelId, dto, files);
    }
    async updateClientDocuments(req, id, files, deleteFields) {
        let parsedDeleteFields;
        if (typeof deleteFields === 'string') {
            try {
                parsedDeleteFields = JSON.parse(deleteFields);
            }
            catch {
                parsedDeleteFields = [deleteFields];
            }
        }
        else if (Array.isArray(deleteFields)) {
            parsedDeleteFields = deleteFields;
        }
        return this.clientService.updateClientDocuments(req.user.id, id, files, parsedDeleteFields);
    }
    deleteClient(req, id) {
        return this.clientService.deleteClient(req.user.id, id);
    }
    getClients(page, limit, name, phone, nationalId, city, status) {
        return this.clientService.getClients(page, {
            limit: limit ? Number(limit) : undefined,
            name,
            phone,
            nationalId,
            city,
            status,
        });
    }
    getClientById(id) {
        return this.clientService.getClientById(id);
    }
    getClientStatement(id, page, limit, from, to) {
        return this.clientService.getClientStatement(id, page, {
            from,
            to,
            limit: Number(limit) || 10,
        });
    }
    async createKafeel(req, clientId, dto, files) {
        return this.clientService.createKafeel(req.user.id, clientId, dto, files);
    }
    async deleteKafeel(req, kafeelId) {
        return this.clientService.deleteKafeel(req.user.id, kafeelId);
    }
};
exports.ClientController = ClientController;
__decorate([
    (0, common_1.Post)(),
    (0, permissions_decorator_1.Permissions)('clients', 'canAdd'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'clientIdImage', maxCount: 1 },
        { name: 'clientWorkCard', maxCount: 1 },
        { name: 'salaryReport', maxCount: 1 },
        { name: 'simaReport', maxCount: 1 },
        { name: 'kafeelIdImage', maxCount: 10 },
        { name: 'kafeelWorkCard', maxCount: 10 },
    ], {
        storage: multer_1.default.memoryStorage(),
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, client_dto_1.CreateClientDto, Object]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "createClient", null);
__decorate([
    (0, common_1.Patch)(':id/client-data'),
    (0, permissions_decorator_1.Permissions)('clients', 'canUpdate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, client_dto_1.UpdateClientDto]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "updateClientData", null);
__decorate([
    (0, common_1.Patch)('kafeel/:id'),
    (0, permissions_decorator_1.Permissions)('clients', 'canUpdate'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'kafeelIdImage', maxCount: 1 },
        { name: 'kafeelWorkCard', maxCount: 1 },
    ], {
        storage: (0, multer_1.memoryStorage)(),
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, client_dto_1.UpdateKafeelDto, Object]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "updateKafeelData", null);
__decorate([
    (0, common_1.Patch)(':id/documents'),
    (0, permissions_decorator_1.Permissions)('clients', 'canUpdate'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'clientIdImage', maxCount: 1 },
        { name: 'clientWorkCard', maxCount: 1 },
        { name: 'salaryReport', maxCount: 1 },
        { name: 'simaReport', maxCount: 1 },
    ], {
        storage: (0, multer_1.memoryStorage)(),
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.UploadedFiles)()),
    __param(3, (0, common_1.Body)('deleteFields')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "updateClientDocuments", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, permissions_decorator_1.Permissions)('clients', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "deleteClient", null);
__decorate([
    (0, common_1.Get)('all/:page'),
    (0, permissions_decorator_1.Permissions)('clients', 'canView'),
    __param(0, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('name')),
    __param(3, (0, common_1.Query)('phone')),
    __param(4, (0, common_1.Query)('nationalId')),
    __param(5, (0, common_1.Query)('city')),
    __param(6, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "getClients", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, permissions_decorator_1.Permissions)('clients', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "getClientById", null);
__decorate([
    (0, common_1.Get)(':id/statement/:page'),
    (0, permissions_decorator_1.Permissions)('clients', 'canView'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('page', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('from')),
    __param(4, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number, String, String]),
    __metadata("design:returntype", void 0)
], ClientController.prototype, "getClientStatement", null);
__decorate([
    (0, common_1.Post)(':id/kafeels'),
    (0, permissions_decorator_1.Permissions)('clients', 'canAdd'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileFieldsInterceptor)([
        { name: 'kafeelIdImage', maxCount: 1 },
        { name: 'kafeelWorkCard', maxCount: 1 },
    ], {
        storage: (0, multer_1.memoryStorage)(),
    })),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, client_dto_1.KafeelDto, Object]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "createKafeel", null);
__decorate([
    (0, common_1.Delete)('kafeel/:id'),
    (0, permissions_decorator_1.Permissions)('clients', 'canDelete'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], ClientController.prototype, "deleteKafeel", null);
exports.ClientController = ClientController = __decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard, permissions_guard_1.PermissionsGuard),
    (0, common_1.Controller)('clients'),
    __metadata("design:paramtypes", [client_service_1.ClientService])
], ClientController);
//# sourceMappingURL=client.controller.js.map