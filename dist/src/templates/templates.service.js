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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TemplatesService = class TemplatesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllTemplates() {
        return this.prisma.template.findMany({
            orderBy: { name: 'asc' }
        });
    }
    async upsertTemplate(currentUser, data) {
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Templates',
                action: 'UPDATE',
                description: `قام ${user?.name} بتحديث القالب ${data.name}`,
            },
        });
        return this.prisma.template.upsert({
            where: { name: data.name },
            update: {
                content: data.content,
                description: data.description,
            },
            create: {
                name: data.name,
                content: data.content,
                description: data.description,
            },
        });
    }
    async getTemplateByName(name) {
        const template = await this.prisma.template.findUnique({
            where: { name },
        });
        if (!template)
            throw new common_1.NotFoundException('Template not found');
        return template;
    }
    async deleteTemplate(name) {
        return this.prisma.template.delete({
            where: { name },
        });
    }
};
exports.TemplatesService = TemplatesService;
exports.TemplatesService = TemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TemplatesService);
//# sourceMappingURL=templates.service.js.map