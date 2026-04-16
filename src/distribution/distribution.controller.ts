import { Controller, Post, Param, Get, Req, UseGuards, Query, Body } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('distribution')
export class DistributionController {
    constructor(private readonly distributionService: DistributionService) { }

    @Post('post/:periodId')
    @Permissions('distribution', 'canPost')
    async postClosing(
        @Req() req,
        @Param('periodId') periodId: string,
        @Body('savingAmount') savingAmount?: number,
        @Body('partnerIds') partnerIds?: number[],
    ) {
        const savingAmountInput = savingAmount ? Number(savingAmount) : undefined;
        return this.distributionService.postClosing(Number(periodId), req.user.id, savingAmountInput, partnerIds);;
    }

    @Post('unpost/:periodId')
    @Permissions('distribution', 'canPost')
    async reverseClosing(
        @Req() req,
        @Param('periodId') periodId: string) {
        return this.distributionService.reverseClosing(Number(periodId), req.user.id);
    }

    @Get('closed-periods')
    @Permissions('distribution', 'canView')
    async getClosedPeriods(@Query('periodId') periodId?: number) {
        return this.distributionService.getClosedPeriods(periodId);
    }
}