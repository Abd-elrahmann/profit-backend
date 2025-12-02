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
exports.AuditLogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const luxon_1 = require("luxon");
let AuditLogService = class AuditLogService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAllLogs(page, limit, filters) {
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.userId) {
            where.userId = filters.userId;
        }
        if (filters.screen) {
            where.screen = { contains: filters.screen, mode: 'insensitive' };
        }
        if (filters.action) {
            where.action = { contains: filters.action, mode: 'insensitive' };
        }
        if (filters.userName) {
            where.user = {
                name: { contains: filters.userName, mode: 'insensitive' },
            };
        }
        if (filters.from || filters.to) {
            where.createdAt = {};
            if (filters.from) {
                const fromUtc = luxon_1.DateTime.fromISO(filters.from, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
                where.createdAt.gte = fromUtc;
            }
            if (filters.to) {
                const toUtc = luxon_1.DateTime.fromISO(filters.to, { zone: 'Asia/Riyadh' })
                    .endOf('day')
                    .toUTC()
                    .toJSDate();
                where.createdAt.lte = toUtc;
            }
        }
        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { name: true, email: true } } },
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        const convertedLogs = logs.map(log => ({
            ...log,
            createdAt: luxon_1.DateTime.fromJSDate(log.createdAt, { zone: 'utc' })
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-MM-dd HH:mm:ss'),
        }));
        return {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            data: convertedLogs,
        };
    }
};
exports.AuditLogService = AuditLogService;
exports.AuditLogService = AuditLogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditLogService);
//# sourceMappingURL=audit-log.service.js.map