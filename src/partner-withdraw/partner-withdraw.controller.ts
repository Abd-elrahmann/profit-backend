import { Controller, Post, Param, ParseIntPipe, Body, Req, UseGuards, Get } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { PartnerWithdrawalScheduler } from './partner-withdraw.scheduler';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partner-withdraw')
export class PartnerWithdrawController {
    constructor(
        private readonly service: PartnerWithdrawService,
        private readonly scheduler: PartnerWithdrawalScheduler,
    ) { }

    @Post(':partnerId')
    withdrawPartner(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body('months') months?: number,
    ) {
        return this.service.withdrawPartner(partnerId, months, req.user.id);
    }

    @Get('details/:partnerId')
    getWithdrawalDetails(
        @Param('partnerId', ParseIntPipe) partnerId: number
    ) {
        return this.service.getWithdrawalDetails(partnerId);
    }

    @Get('run-scheduler')
    async runMonthlyScheduler() {
        try {
            await this.scheduler.handleMonthlyWithdrawals();
            return { message: '✔ تم تنفيذ جدول صرف المساهمين بنجاح' };
        } catch (err) {
            return { message: '❌ فشل تنفيذ الجدول', error: err.message };
        }
    }
}