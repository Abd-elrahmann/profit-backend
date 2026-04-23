import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ExternalInvestmentService } from './external-investment.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('external-investments')
export class ExternalInvestmentController {
    constructor(private service: ExternalInvestmentService) { }

    @Post('withdraw')
    @Permissions('external-investments', 'canAdd')
    withdraw(@Req() req, @Body() body) {
        return this.service.withdraw(req.user.id, body.amount, body.BankId);
    }

    @Post('return/:id')
    @Permissions('external-investments', 'canPost')
    returnInvestment(@Param('id') id: string, @Body() body, @Req() req,) {
        return this.service.returnInvestment(+id, body.amount, req.user.id);
    }

    @Get('all/:page')
    @Permissions('external-investments', 'canView')
    findAll(
        @Param('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: 'OPEN' | 'CLOSED',
        @Query('userId') userId?: string,
        @Query('bankAccountId') bankAccountId?: string,
        @Query('fromDate') fromDate?: string,
        @Query('toDate') toDate?: string,
    ) {
        return this.service.findAll(
            page ? parseInt(page) : 1,
            limit ? parseInt(limit) : 10,
            status,
            userId ? parseInt(userId) : undefined,
            bankAccountId ? parseInt(bankAccountId) : undefined,
            fromDate,
            toDate,
        );
    }

    @Get(':id')
    @Permissions('external-investments', 'canView')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.service.findOne(id);
    }

    @Patch('distribute/:id')
    @Permissions('external-investments', 'canPost')
    distributeProfit(
        @Param('id', ParseIntPipe) id: number,
        @Req() req,
    ) {
        return this.service.distributeProfit(id, req.user.id);
    }

    @Patch('reverse-distribution/:id')
    @Permissions('external-investments', 'canPost')
    reverseDistribution(
        @Param('id', ParseIntPipe) id: number,
        @Req() req,
    ) {
        return this.service.reverseDistribution(id, req.user.id);
    }

    @Delete(':id')
    deleteRecord(
        @Param('id', ParseIntPipe) id: number,
        @Req() req,
    ) {
        return this.service.deleteRecord(id, req.user.id);
    }
}