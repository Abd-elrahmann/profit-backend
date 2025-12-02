import { AuditLogService } from './audit-log.service';
export declare class AuditLogController {
    private readonly auditLogService;
    constructor(auditLogService: AuditLogService);
    getAllLogs(page: number, limit?: number, userId?: number, screen?: string, action?: string, userName?: string, from?: string, to?: string): Promise<{
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        data: {
            createdAt: string;
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
