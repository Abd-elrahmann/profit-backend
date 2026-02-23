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
        @Query('filter') filter?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all',
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.dashboardService.getClientStats(filter, from, to);
    }

    @Get('client-registration-growth')
    async getClientRegistrationGrowth(
        @Query('months') months?: string,
        @Query('period') period?: 'first' | 'last',
    ) {
        return this.dashboardService.getClientRegistrationGrowth(
            months ? parseInt(months, 10) : 6,
            period === 'last' ? 'last' : 'first',
        );
    }

    @Get('partner-stats')
    async getPartnerStats(
        @Query('filter') filter?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all',
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.dashboardService.getPartnerStats(filter, from, to);
    }

    @Get('loan-stats')
    getLoanAndBankStats(
        @Query('filter') filter?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all',
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.dashboardService.getLoanAndBankStats(filter, from, to);
    }

    @Get('monthly-collection')
    async getMonthlyCollection() {
        return this.dashboardService.getMonthlyCollection();
    }

    @Get('expense-stats')
    async getExpenseStats(
        @Query('filter') filter?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'all',
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('period') period?: 'first' | 'last',
    ) {
        return this.dashboardService.getExpenseStats(filter, from, to, period === 'last' ? 'last' : 'first');
    }

    @Get('Upcoming-Repayments')
    async getUpcomingRepayments(
        @Query('limit') limit?: string,
        @Query('days') days?: string,
    ) {
        return this.dashboardService.getUpcomingRepayments(
            limit ? parseInt(limit, 10) : 20,
            days ? parseInt(days, 10) : 7,
        );
    }

    @Get('Last-Actions')
    async getLastActions(
        @Query('limit') limit?: string,
        @Query('screen') screen?: string,
    ) {
        return this.dashboardService.getLastActions(
            limit ? parseInt(limit, 10) : 10,
            screen,
        );
    }

    @Get('last-actions-stats')
    async getLastActionsStats() {
        return this.dashboardService.getLastActionsStats();
    }

    @Get('latest-clients')
    async getLatestClients(@Query('limit') limit?: string) {
        return this.dashboardService.getLatestClients(limit ? parseInt(limit, 10) : 5);
    }

    @Get('top-committed-clients')
    async getTopCommittedClients(@Query('limit') limit?: string) {
        return this.dashboardService.getTopCommittedClients(limit ? parseInt(limit, 10) : 5);
    }

    @Get('partner-details')
    async getPartnerDetails(@Query('limit') limit?: string) {
        return this.dashboardService.getPartnerDetailsForDashboard(limit ? parseInt(limit, 10) : 10);
    }

    @Get('partner-profit-growth')
    async getPartnerProfitGrowth(
        @Query('months') months?: string,
        @Query('period') period?: 'first' | 'last',
    ) {
        return this.dashboardService.getPartnerProfitGrowth(
            months ? parseInt(months, 10) : 6,
            period === 'last' ? 'last' : 'first',
        );
    }

    @Get('latest-loans')
    async getLatestLoans(@Query('limit') limit?: string) {
        return this.dashboardService.getLatestLoans(limit ? parseInt(limit, 10) : 5);
    }

    @Get('loan-distribution')
    async getLoanDistribution() {
        return this.dashboardService.getLoanDistributionBySource();
    }

    @Get('repayment-trend')
    async getRepaymentTrend(@Query('months') months?: string, @Query('period') period?: string) {
        return this.dashboardService.getMonthlyRepaymentTrend(
            months ? parseInt(months, 10) : 6,
            period as 'first' | 'last' || 'first'
        );
    }

    @Get('daily-collection-trend')
    async getDailyCollectionTrend(@Query('days') days?: string) {
        return this.dashboardService.getDailyCollectionTrend(days ? parseInt(days, 10) : 7);
    }

    @Get('pending-review-repayments')
    async getPendingReviewRepayments(@Query('limit') limit?: string) {
        return this.dashboardService.getPendingReviewRepayments(limit ? parseInt(limit, 10) : 10);
    }

    @Get('repayments-by-month')
    async getRepaymentsByMonth(@Query('year') year?: string, @Query('month') month?: string) {
        const y = year ? parseInt(year, 10) : new Date().getFullYear();
        const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
        return this.dashboardService.getRepaymentsByMonth(y, m);
    }
}