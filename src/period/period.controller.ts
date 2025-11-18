import { Controller, Post, Param, Body, ParseIntPipe, Req, UseGuards, Patch, Get , Query} from '@nestjs/common';
import { PeriodService } from './period.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('periods')
export class PeriodController {
    constructor(private readonly periodService: PeriodService) { }

    @Post(':id/close')
    @Permissions('period', 'canPost')
    async closePeriod(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.periodService.closePeriod(+id, req.user.id);
    }

    @Patch('reverse-close/:id')
    @Permissions('period', 'canPost')
    async reverseClosePeriod(
        @Param('id') id: number,
        @Req() req: any,
    ) {
        const userId = req.user.id;
        return this.periodService.reversePeriodClosing(Number(id), userId);
    }

    @Get(':id')
    @Permissions('period', 'canView')
    async getPeriodDetails(@Param('id', ParseIntPipe) periodId: number) {
        return this.periodService.getPeriodDetails(periodId);
    }

    @Get('all/:page')
    @Permissions('period', 'canView')
    async getAllPeriods(
        @Param('page', ParseIntPipe)  page: number,
        @Query() filters: any
    ) {
        return this.periodService.getAllPeriods(Number(page) || 1, filters);
    }
}