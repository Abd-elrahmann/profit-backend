import { PrismaService } from '../prisma/prisma.service';
export declare class AuditLogService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private toHijri;
    getAllLogs(page: number, limit: number, filters: {
        userId?: number;
        screen?: string;
        action?: string;
        userName?: string;
        from?: string;
        to?: string;
    }): Promise<{
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        data: {
            createdAt: string;
            createdAtHijri: any;
            user: {
                email: string;
                name: string;
            };
            id: number;
            screen: string;
            action: string;
            description: string | null;
            userId: number;
        }[];
    }>;
}
