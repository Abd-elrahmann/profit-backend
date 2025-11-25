import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ClientReportService } from './client-report.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('client-report')
export class ClientReportController {
    constructor(private readonly reportService: ClientReportService) { }

    @Get(':page')
    @Permissions('client-report', 'canView')
    getAllClients(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
    ) {
        return this.reportService.getAllClients(page, limit);
    }

    @Get('client/:clientId')
    @Permissions('client-report', 'canView')
    getClientDetails(@Param('clientId', ParseIntPipe) clientId: number) {
        return this.reportService.getClientDetails(clientId);
    }
}