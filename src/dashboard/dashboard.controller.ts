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
    async getClientStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly',
    ) {
        return this.dashboardService.getClientStats(filter);
    }

    @Get('partner-stats')
    async getPartnerStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly'
    ) {
        return this.dashboardService.getPartnerStats(filter);
    }

    @Get('loan-stats')
    getLoanAndBankStats(
        @Query('filter') filter?: 'daily' | 'monthly' | 'yearly'
    ) {
        return this.dashboardService.getLoanAndBankStats(filter);
    }

    @Get('monthly-collection')
    async getMonthlyCollection() {
        return this.dashboardService.getMonthlyCollection();
    }

    @Get('Upcoming-Repayments')
    async getUpcomingRepayments() {
        return this.dashboardService.getUpcomingRepayments();
    }

    @Get('Last-Actions')
    async getLastActions() {
        return this.dashboardService.getLastActions();
    }
}