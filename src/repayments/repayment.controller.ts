import {
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Body,
    Post,
    UploadedFile,
    UseInterceptors,
    UseGuards,
    UploadedFiles,
    Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { RepaymentService } from './repayment.service';
import { RepaymentFilesService } from './repaymentFiles.service';
import { RepaymentDto } from './dto/repayment.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)

@Controller('repayments')
export class RepaymentController {
    constructor(private readonly repaymentService: RepaymentService,
        private readonly repaymentFilesService: RepaymentFilesService
    ) { }

    @Get('repayment/:id')
    @Permissions('repayments', 'canView')
    getRepaymentById(@Param('id', ParseIntPipe) id: number) {
        return this.repaymentService.getRepaymentById(id);
    }


    @Post('upload/:id')
    @UseInterceptors(FilesInterceptor('file', 10, { limits: { fileSize: 10 * 1024 * 1024 } }))
    uploadReceipts(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        return this.repaymentFilesService.uploadReceipts(req.user.id, id, files);
    }


    @Patch('approve/:id')
    @Permissions('repayments', 'canPost')
    approveRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.approveRepayment(req.user.id, id, dto);
    }


    @Patch('reject/:id')
    @Permissions('repayments', 'canPost')
    rejectRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.rejectRepayment(req.user.id, id, dto);
    }


    @Patch('postpone/:id')
    @Permissions('repayments', 'canPost')
    postponeRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.postponeRepayment(req.user.id, id, dto);
    }


    @Post('PaymentProof/:id')
    @Permissions('repayments', 'canPost')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
    uploadPaymentProof(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.repaymentFilesService.uploadPaymentProof(req.user.id, id, file);
    }


    @Patch('partial-paid/:id')
    @Permissions('repayments', 'canPost')
    async markAsPartialPaid(
        @Req() req,
        @Param('id') id: string,
        @Body('paidAmount') paidAmount: number,
    ) {
        return this.repaymentService.markAsPartialPaid(req.user.id, Number(id), Number(paidAmount));
    }

    @Patch('early-pay/:id')
    @Permissions('repayments', 'canPost')
    async markAsEarlyPaid(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body('discount') earlyPaymentDiscount: number,
    ) {
        const result = await this.repaymentService.markLoanAsEarlyPaid(
            id,
            earlyPaymentDiscount,
            req.user.id,
        );
        return result;
    }


    @Post('approve-many')
    @Permissions('repayments', 'canPost')
    async approveMany(
        @Req() req,
        @Body() body: { ids: number[]; notes?: string },
    ) {
        const dto: RepaymentDto = { notes: body.notes };
        return this.repaymentService.approveMany(req.user.id, body.ids, dto);
    }


    @Post('reject-many')
    @Permissions('repayments', 'canPost')
    async rejectMany(
        @Req() req,
        @Body() body: { ids: number[]; notes?: string },
    ) {
        const dto: RepaymentDto = { notes: body.notes };
        return this.repaymentService.rejectMany(req.user.id, body.ids, dto);
    }


    @Post('payment-proof-bulk')
    @Permissions('repayments', 'canPost')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
    uploadPaymentProofBulk(
        @Req() req,
        @UploadedFile() file: Express.Multer.File,
        @Body('repaymentIds') repaymentIds: number[],
    ) {
        return this.repaymentFilesService.uploadPaymentProofBulk(
            req.user.id,
            repaymentIds,
            file,
        );
    }

    @Get('next-count')
    @Permissions('repayments', 'canView')
    async getNextRepaymentCount() {
        return this.repaymentFilesService.getNextRepaymentCount();
    }
}