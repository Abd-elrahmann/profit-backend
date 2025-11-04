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
    Req,
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
    create(@Req() req, @Body() dto: CreateLoanDto) {
        return this.loansService.createLoan(req.user.id , dto);
    }

    @Patch(':id/activate')
    @Permissions('loans', 'canUpdate')
    activate(@Req() req, @Param('id', ParseIntPipe) id: number) {

        return this.loansService.activateLoan(id, req.user.id);
    }

    @Patch(':id/deactivate')
    @Permissions('loans', 'canUpdate')
    deactivateLoan(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.loansService.deactivateLoan(req.user.id , id);
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
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoanDto) {
        return this.loansService.updateLoan(req.user.id , id, dto);
    }

    @Delete(':id')
    @Permissions('loans', 'canDelete')
    delete(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.loansService.deleteLoan(req.user.id , id);
    }

    @Post(':id/upload-debt-acknowledgment')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDebtAcknowledgment(
        @Req() req,
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.loansService.uploadDebtAcknowledgmentFile(req.user.id , id, file);
    }

    @Post(':id/upload-promissory-note')
    @UseInterceptors(FileInterceptor('file'))
    async uploadPromissoryNote(
        @Req() req,
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.loansService.uploadPromissoryNoteFile(req.user.id , id, file);
    }
}