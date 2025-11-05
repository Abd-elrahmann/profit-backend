import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)

@Controller('logs')
export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogService) { }

    @Get(':page')
    @Permissions('logs', 'canView')
    async getAllLogs(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('userId') userId?: number,
        @Query('screen') screen?: string,
        @Query('action') action?: string,
        @Query('userName') userName?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.auditLogService.getAllLogs(+page, +limit, { userId , screen, action, userName, from, to });
    }
}
