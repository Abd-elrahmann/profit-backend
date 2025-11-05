import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateTime } from 'luxon';

@Injectable()
export class AuditLogService {
    constructor(private readonly prisma: PrismaService) { }

    async getAllLogs(
        page: number,
        limit: number,
        filters: {
            userId?: number;
            screen?: string;
            action?: string;
            userName?: string;
            from?: string;
            to?: string;
        },
    ) {
        const skip = (page - 1) * limit;

        const where: any = {};

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
                const fromUtc = DateTime.fromISO(filters.from, { zone: 'Asia/Riyadh' })
                    .startOf('day')
                    .toUTC()
                    .toJSDate();
                where.createdAt.gte = fromUtc;
            }

            if (filters.to) {
                const toUtc = DateTime.fromISO(filters.to, { zone: 'Asia/Riyadh' })
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
            createdAt: DateTime.fromJSDate(log.createdAt, { zone: 'utc' })
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
}