import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ClientReportService } from './client-report.service';

@Controller('client-report')
export class ClientReportController {
    constructor(private readonly reportService: ClientReportService) { }

    @Get(':page')
    getAllClients(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
    ) {
        return this.reportService.getAllClients(page, limit);
    }

    @Get('client/:clientId')
    getClientDetails(@Param('clientId', ParseIntPipe) clientId: number) {
        return this.reportService.getClientDetails(clientId);
    }
}