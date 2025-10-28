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
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';

@Controller('loans')
export class LoansController {
    constructor(private readonly loansService: LoansService) { }

    @Post()
    create(@Body() dto: CreateLoanDto) {
        return this.loansService.createLoan(dto);
    }

    @Patch(':id/activate')
    activate(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.activateLoan(id);
    }

    @Get('all/:page')
    getAll(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('status') status?: string,
        @Query('clientName') clientName?: string,
    ) {
        return this.loansService.getAllLoans(page, +limit, { status, clientName });
    }

    @Get(':id')
    getById(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.getLoanById(id);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLoanDto) {
        return this.loansService.updateLoan(id, dto);
    }

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.loansService.deleteLoan(id);
    }
}