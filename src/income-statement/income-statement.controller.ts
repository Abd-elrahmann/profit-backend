import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { IncomeStatementService } from './income-statement.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('income-statement')
export class IncomeStatementController {
    constructor(private incomeService: IncomeStatementService) { }

    @Get()
    // @Permissions('income-statement', 'canView')
    async getIncomeStatement(
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.incomeService.getIncomeStatement(from, to);
    }
}