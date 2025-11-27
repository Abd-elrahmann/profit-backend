import { Controller, Post, Get, Body, Query, BadRequestException, Req, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('company')
export class CompanyController {
    constructor(private readonly companyService: CompanyService) { }

    // Withdraw profit
    @Post('withdraw-profit')
    @Permissions('company', 'canPost')
    async withdrawProfit(
        @Req() req,
        @Body("amount") amount: number) {
        return this.companyService.withdrawProfit(+amount, req.user.id);
    }

    // Profit report
    @Get('profit-report/:page')
    @Permissions('company', 'canView')
    async getProfitReport(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.companyService.getProfitReport(page, {
            limit,
            search,
            startDate,
            endDate,
        });
    }
}