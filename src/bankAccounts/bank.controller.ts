import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Patch,
    ParseIntPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('bank')
export class BankController {
    constructor(private readonly bankService: BankService) { }

    @Post()
    @Permissions('banks', 'canAdd')
    createBankAccount(@Body() body: { name: string; accountNumber: string }) {
        return this.bankService.createBankAccount(body);
    }

    @Get('all/:page')
    @Permissions('banks', 'canView')
    getAllBankAccounts(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('search') search?: string,
    ) {
        return this.bankService.getAllBankAccounts(page, +limit, { search });
    }

    @Get(':id')
    @Permissions('banks', 'canView')
    getBankAccountById(@Param('id') id: string) {
        return this.bankService.getBankAccountById(Number(id));
    }

    @Patch(':id')
    @Permissions('banks', 'canUpdate')
    updateBankAccount(
        @Param('id') id: string,
        @Body() body: { name?: string; accountNumber?: string },
    ) {
        return this.bankService.updateBankAccount(Number(id), body);
    }

    @Delete(':id')
    @Permissions('banks', 'canDelete')
    deleteBankAccount(@Param('id') id: string) {
        return this.bankService.deleteBankAccount(Number(id));
    }
}