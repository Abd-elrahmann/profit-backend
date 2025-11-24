import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
    constructor(private readonly dashboardService: DashboardService) { }

    @Get('client-stats')
    @Permissions('dashboard', 'canView')
    async getClientStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly',
    ) {
        return this.dashboardService.getClientStats(filter);
    }

    @Get('partner-stats')
    @Permissions('dashboard', 'canView')
    async getPartnerStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly'
    ) {
        return this.dashboardService.getPartnerStats(filter);
    }

    @Get('loan-stats')
    @Permissions('dashboard', 'canView')
    getLoanAndBankStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly'
    ) {
        return this.dashboardService.getLoanAndBankStats(filter);
    }

    @Get('monthly-collection')
    @Permissions('dashboard', 'canView')
    async getMonthlyCollection() {
        return this.dashboardService.getMonthlyCollection();
    }
}