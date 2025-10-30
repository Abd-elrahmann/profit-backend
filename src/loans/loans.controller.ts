import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    Query,
    UseGuards,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('loans')
export class LoansController {
    constructor(private readonly loansService: LoansService) { }

    @Post()
    @Permissions('loans', 'canAdd')
    create(@Body() dto: CreateLoanDto) {
        return this.loansService.createLoan(dto);
    }

    @Patch(':id/activate')
    @Permissions('loans', 'canUpdate')
    activate(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.activateLoan(id);
    }

    @Get('all/:page')
    @Permissions('loans', 'canView')
    getAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('status') status?: string,
        @Query('code') code?: string,
        @Query('clientName') clientName?: string,
    ) {
        return this.loansService.getAllLoans(page, +limit, { status, code, clientName });
    }

    @Get(':id')
    @Permissions('loans', 'canView')
    getById(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.getLoanById(id);
    }

    @Patch(':id')
    @Permissions('loans', 'canUpdate')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoanDto) {
        return this.loansService.updateLoan(id, dto);
    }

    @Delete(':id')
    @Permissions('loans', 'canDelete')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.deleteLoan(id);
    }

    @Post(':id/upload-debt-acknowledgment')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDebtAcknowledgment(
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.loansService.uploadDebtAcknowledgmentFile(id, file);
    }

    @Post(':id/upload-promissory-note')
    @UseInterceptors(FileInterceptor('file'))
    async uploadPromissoryNote(
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.loansService.uploadPromissoryNoteFile(id, file);
    }
}