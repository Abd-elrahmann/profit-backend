import { Controller, Post, Param, ParseIntPipe, Body, Req, UseGuards, Get } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partner-withdraw')
export class PartnerWithdrawController {
    constructor(
        private readonly service: PartnerWithdrawService,
    ) { }

    @Post(':partnerId')
    withdrawPartner(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body('amount') amount: number,
    ) {
        return this.service.withdrawPartner(partnerId, amount, req.user.id);
    }

    @Get('details/:partnerId')
    getWithdrawalDetails(
        @Param('partnerId', ParseIntPipe) partnerId: number
    ) {
        return this.service.getWithdrawalDetails(partnerId);
    }

    @Post('approve/:scheduleId')
    approveWithdrawalPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
    ) {
        return this.service.approveWithdrawalPayment(req.user.id, scheduleId);
    }

    @Post('reject/:scheduleId')
    rejectWithdrawalPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
    ) {
        return this.service.rejectWithdrawalPayment(req.user.id, scheduleId);
    }

    @Post('partial/:scheduleId')
    async partialPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
        @Body('paidAmount') paidAmount: number,
    ) {
        const currentUser = req.user.id;
        return this.service.partialPayWithdrawal(currentUser, scheduleId, paidAmount);
    }
}