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
import { RepaymentDto } from './dto/repayment.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)

@Controller('repayments')
export class RepaymentController {
    constructor(private readonly repaymentService: RepaymentService) { }

    // Get all repayments for a specific loan
    @Get(':loanId')
    @Permissions('repayments', 'canView')
    getRepaymentsByLoan(@Param('loanId', ParseIntPipe) loanId: number) {
        return this.repaymentService.getRepaymentsByLoan(loanId);
    }

    // Get specific repayment by ID
    @Get('repayment/:id')
    @Permissions('repayments', 'canView')
    getRepaymentById(@Param('id', ParseIntPipe) id: number) {
        return this.repaymentService.getRepaymentById(id);
    }

    // Upload multiple receipt images
    @Post('upload/:id')
    @UseInterceptors(FilesInterceptor('file'))
    uploadReceipts(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFiles() files: Express.Multer.File[],
    ) {
        return this.repaymentService.uploadReceipts(req.user.id, id, files);
    }

    // Approve repayment
    @Patch('approve/:id')
    @Permissions('repayments', 'canPost')
    approveRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.approveRepayment(req.user.id, id, dto);
    }

    // Reject repayment
    @Patch('reject/:id')
    @Permissions('repayments', 'canPost')
    rejectRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.rejectRepayment(req.user.id, id, dto);
    }

    // Postpone repayment
    @Patch('postpone/:id')
    @Permissions('repayments', 'canPost')
    postponeRepayment(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.postponeRepayment(req.user.id, id, dto);
    }

    // Upload receipt image
    @Post('PaymentProof/:id')
    @Permissions('repayments', 'canPost')
    @UseInterceptors(FileInterceptor('file'))
    uploadPaymentProof(
        @Req() req,
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.repaymentService.uploadPaymentProof(req.user.id, id, file);
    }

    // Mark repayment as partial paid
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
}