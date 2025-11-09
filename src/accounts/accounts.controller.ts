import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    ParseIntPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)

@Controller('accounts')
export class AccountsController {
    constructor(private readonly accountsService: AccountsService) { }

    @Post()
    create(@Body() dto: CreateAccountDto) {
        return this.accountsService.createAccount(dto);
    }

    @Patch(':id')
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAccountDto) {
        return this.accountsService.updateAccount(id, dto);
    }

    @Delete(':id')
    delete(@Param('id', ParseIntPipe) id: number) {
        return this.accountsService.deleteAccount(id);
    }

    @Get('all/:page')
    getAllAccounts(
        @Param('page', ParseIntPipe) page: number,
        @Query('limit') limit = 10,
        @Query('search') search?: string,
    ) {
        return this.accountsService.getAllAccounts(page, +limit, { search });
    }

    @Get('tree')
    getTree() {
        return this.accountsService.getAccountsTree();
    }

    @Get('bank')
    getBankAccountReport() {
        return this.accountsService.getBankAccountReport();
    }

    @Get(':id/:page')
    getAccountById(
        @Param('id', ParseIntPipe) id: number,
        @Param('page', ParseIntPipe) page: number,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('limit') limit = '10',
    ) {
        return this.accountsService.getAccountById(id, page, {
            from,
            to,
            limit: Number(limit),
        });
    }
}