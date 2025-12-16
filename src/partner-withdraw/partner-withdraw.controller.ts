import { Controller, Post, Param, ParseIntPipe, Body, Req, UseGuards, Get, UploadedFile, UseInterceptors, Query, Patch } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

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

    @Get('preview/:partnerId')
    async previewDefaultShare(
        @Param('partnerId') partnerId: number,
    ) {
        return this.service.previewPartnerDefaultShare(
            Number(partnerId),
        );
    }

    @Patch(':partnerId')
    async updateWithdrawalAmount(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body('amount') amount: number,
    ) {
        return this.service.updateWithdrawalMonthlyAmount(
            req.user.id,
            partnerId,
            amount,
        );
    }

    @Get('details/:partnerId')
    getWithdrawalDetails(
        @Param('partnerId', ParseIntPipe) partnerId: number
    ) {
        return this.service.getWithdrawalDetails(partnerId);
    }

    @Post('approve/:scheduleId')
    @Permissions('partners-withdraw', 'canPost')
    approveWithdrawalPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
    ) {
        return this.service.approveWithdrawalPayment(req.user.id, scheduleId);
    }

    @Post('reject/:scheduleId')
    @Permissions('partners-withdraw', 'canPost')
    rejectWithdrawalPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
    ) {
        return this.service.rejectWithdrawalPayment(req.user.id, scheduleId);
    }

    @Post('partial/:scheduleId')
    @Permissions('partners-withdraw', 'canPost')
    async partialPayment(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
        @Body('paidAmount') paidAmount: number,
    ) {
        const currentUser = req.user.id;
        return this.service.partialPayWithdrawal(currentUser, scheduleId, paidAmount);
    }

    @Get('all-withdrawing/:page')
    getAllWithdrawingPartners(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
    ) {
        return this.service.getAllWithdrawingPartners(page, +limit);
    }

    @Post('upload-receipt/:partnerId')
    @UseInterceptors(FileInterceptor('file'))
    uploadWithdrawalReceipt(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.service.uploadWithdrawalReceipt(req.user.id, partnerId, file);
    }
}