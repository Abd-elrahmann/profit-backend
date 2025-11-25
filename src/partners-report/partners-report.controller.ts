import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { PartnersReportService } from './partners-report.service';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partner-report')
export class PartnersReportController {
    constructor(private readonly service: PartnersReportService) { }

    @Get(':page')
    @Permissions('partner-report', 'canView')
    getAllPartners(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number) {
        return this.service.getAllPartners(page, limit);
    }

    @Get('partner/:id')
    @Permissions('partner-report', 'canView')
    getPartnerDetails(@Param('id', ParseIntPipe) id: number) {
        return this.service.getPartnerDetails(id);
    }
}