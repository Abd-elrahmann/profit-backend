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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

    // Upload receipt image
    @Post('upload/:id')
    @UseInterceptors(FileInterceptor('file'))
    uploadReceipt(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.repaymentService.uploadReceipt(id, file);
    }

    // Approve repayment
    @Patch('approve/:id')
    @Permissions('repayments', 'canPost')
    approveRepayment(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.approveRepayment(id, dto);
    }

    // Reject repayment
    @Patch('reject/:id')
    @Permissions('repayments', 'canPost')
    rejectRepayment(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.rejectRepayment(id, dto);
    }

    // Postpone repayment
    @Patch('postpone/:id')
    @Permissions('repayments', 'canPost')
    postponeRepayment(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: RepaymentDto,
    ) {
        return this.repaymentService.postponeRepayment(id, dto);
    }
}
