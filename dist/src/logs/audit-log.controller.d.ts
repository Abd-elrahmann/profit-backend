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
            createdAtHijri: any;
            user: {
                email: string;
                name: string;
            };
            id: number;
            description: string | null;
            screen: string;
            action: string;
            userId: number;
        }[];
    }>;
}
