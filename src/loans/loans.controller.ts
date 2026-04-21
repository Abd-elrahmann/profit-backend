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
    Req
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { LoansConversionService } from './loanConversion.service';
import { loansFilesService } from './loansFiles.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UnpostedJournalsGuard } from '../common/guards/unposted-journals.guard';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('loans')
export class LoansController {
    constructor(private readonly loansService: LoansService,
        private readonly LoansConversionService: LoansConversionService,
        private readonly loansFilesService: loansFilesService
    ) { }

    @Post()
    @Permissions('loans', 'canAdd')
    @UseGuards(UnpostedJournalsGuard)
    create(@Req() req, @Body() dto: CreateLoanDto) {
        return this.loansService.createLoan(req.user.id, dto);
    }

    @Patch(':id/activate')
    @Permissions('loans', 'canUpdate')
    @UseGuards(UnpostedJournalsGuard)
    activate(@Req() req, @Param('id', ParseIntPipe) id: number) {

        return this.loansService.activateLoan(id, req.user.id);
    }

    @Patch(':id/deactivate')
    @Permissions('loans', 'canUpdate')
    @UseGuards(UnpostedJournalsGuard)
    deactivateLoan(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.loansService.deactivateLoan(req.user.id, id);
    }

    @Get('get/unposted-journals')
    @Permissions('loans', 'canView')
    getUnpostedJournals() {
        return this.loansService.getUnpostedJournalsForLoans();
    }

    @Get('balance/:id')
    getBankAccountBalance(@Param('id') id: string) {
        return this.loansService.getBankAccountBalance(Number(id));
    }

    @Get('all/:page')
    @Permissions('loans', 'canView')
    getAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('status') status?: string,
        @Query('code') code?: string,
        @Query('clientName') clientName?: string,
        @Query('clientId') clientId?: number,
    ) {
        return this.loansService.getAllLoans(page, +limit, { status, code, clientName, clientId });
    }

    @Get(':id/:page')
    @Permissions('loans', 'canView')
    getById(
        @Param('id', ParseIntPipe) id: number,
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
    ) {
        return this.loansService.getLoanById(id, page, +limit);
    }

    @Get(':id')
    @Permissions('loans', 'canView')
    getByIdwithoutpage(
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.loansService.getLoanById(id, 1, 10);
    }

    @Patch(':id')
    @Permissions('loans', 'canUpdate')
    @UseGuards(UnpostedJournalsGuard)
    update(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoanDto) {
        return this.loansService.updateLoan(req.user.id, id, dto);
    }

    @Delete(':id')
    @Permissions('loans', 'canDelete')
    @UseGuards(UnpostedJournalsGuard)
    delete(@Req() req, @Param('id', ParseIntPipe) id: number) {
        return this.loansService.deleteLoan(req.user.id, id);
    }

    @Post(':id/upload-debt-acknowledgment')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
    }))
    async uploadDebtAcknowledgment(
        @Req() req,
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: any
    ) {
        return this.loansFilesService.uploadDebtAcknowledgmentFile(req.user.id, id, file, body);
    }

    @Post(':id/upload-promissory-note')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
    }))
    async uploadPromissoryNote(
        @Req() req,
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File,
        @Body() body: any
    ) {
        return this.loansFilesService.uploadPromissoryNoteFile(req.user.id, id, file, body);
    }

    @Post(':id/save-contract-numbers')
    async saveContractNumbers(
        @Req() req,
        @Param('id') id: number,
        @Body() body: { debtAcknowledgmentNumber?: string; promissoryNoteNumber?: string }
    ) {
        return this.loansFilesService.saveContractNumbers(req.user.id, id, body);
    }

    @Post(':id/upload-Settlement')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
    async uploadSettlementFile(
        @Req() req,
        @Param('id') id: number,
        @UploadedFile() file: Express.Multer.File
    ) {
        return this.loansFilesService.uploadSettlementFile(req.user.id, id, file);
    }

    @Patch('convert-client/:loanId')
    @Permissions('loans', 'canUpdate')
    @UseGuards(UnpostedJournalsGuard)
    async convertClient(
        @Req() req,
        @Param('loanId', ParseIntPipe) loanId: number,
        @Body('fromClientId', ParseIntPipe) fromClientId: number,
        @Body('toClientId', ParseIntPipe) toClientId: number,
        @Body('kafeelId') kafeelId?: number | null,
    ) {
        return this.LoansConversionService.convertLoanClient(fromClientId, toClientId, loanId, kafeelId || null, req.user.id);
    }

    @Patch('convert-partial/:loanId')
    @Permissions('loans', 'canUpdate')
    @UseGuards(UnpostedJournalsGuard)
    async transferPartialLoanAmount(
        @Req() req,
        @Param('loanId', ParseIntPipe) loanId: number,
        @Body('fromClientId', ParseIntPipe) fromClientId: number,
        @Body('toClientId', ParseIntPipe) toClientId: number,
        @Body('amount', ParseIntPipe) amount: number,
        @Body('paymentAmount', ParseIntPipe) paymentAmount: number,
        @Body('repaymentDay') repaymentDay: string,
        @Body('kafeelId') kafeelId?: number | null,
    ) {
        const parsedRepaymentDay = new Date(repaymentDay);

        return this.LoansConversionService.transferPartialLoanAmount(fromClientId, toClientId, loanId, amount, paymentAmount, parsedRepaymentDay, kafeelId || null, req.user.id);
    }

    @Get('get/counts/:loanId')
    @Permissions('loans', 'canView')
    async getLoanCountById(
        @Param('loanId', ParseIntPipe) loanId: number,
    ) {
        return this.loansService.getLoanCountById(loanId);
    }
}