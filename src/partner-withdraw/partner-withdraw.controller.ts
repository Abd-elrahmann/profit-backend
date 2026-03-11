import { Controller, Post, Param, ParseIntPipe, Body, Req, UseGuards, Get, UploadedFile, UseInterceptors, Query, Patch } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UnpostedJournalsGuard } from '../common/guards/unposted-journals.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('partner-withdraw')
export class PartnerWithdrawController {
    constructor(
        private readonly service: PartnerWithdrawService,
    ) { }

    @Post(':partnerId')
    @Permissions('partners-withdraw', 'canAdd')
    @UseGuards(UnpostedJournalsGuard)
    withdrawPartner(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body('amount') amount: number,
        @Body('firstPaymentDate') firstPaymentDate?: string,
    ) {
        return this.service.withdrawPartner(partnerId, amount, req.user.id, firstPaymentDate);
    }

    @Get('preview/:partnerId')
    @Permissions('partners-withdraw', 'canView')
    async previewDefaultShare(
        @Param('partnerId') partnerId: number,
    ) {
        return this.service.previewPartnerDefaultShare(
            Number(partnerId),
        );
    }

    @Patch(':partnerId')
    @Permissions('partners-withdraw', 'canUpdate')
    async updateWithdrawalAmount(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
        @Body('amount') amount: number,
        @Body('firstPaymentDate') firstPaymentDate?: string,
    ) {
        return this.service.updateWithdrawalMonthlyAmount(
            req.user.id,
            partnerId,
            amount,
            firstPaymentDate,
        );
    }

    @Get('details/:partnerId')
    @Permissions('partners-withdraw', 'canView')
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
    @Permissions('partners-withdraw', 'canView')
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

    @Get('next-count')
    @Permissions('partners-withdraw', 'canView')
    async getNextPartnerCount() {
        return this.service.getNextPartnerCount();
    }

    @Get('next-voucher-number')
    @Permissions('partners-withdraw', 'canView')
    async getNextVoucherNumber() {
        return this.service.getNextWithdrawVoucherNumber();
    }

    @Post('upload-voucher/:scheduleId')
    @Permissions('partners-withdraw', 'canPost')
    @UseInterceptors(FileInterceptor('file'))
    uploadWithdrawVoucher(
        @Req() req,
        @Param('scheduleId', ParseIntPipe) scheduleId: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.service.uploadWithdrawVoucher(req.user.id, scheduleId, file);
    }

    @Post('cancel/:partnerId')
    @Permissions('partners-withdraw', 'canPost')
    reverseWithdrawal(
        @Req() req,
        @Param('partnerId', ParseIntPipe) partnerId: number,
    ) {
        return this.service.reverseWithdrawal(req.user.id, partnerId);
    }
}