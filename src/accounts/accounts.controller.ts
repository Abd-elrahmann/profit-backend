import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    ParseIntPipe,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounts.dto';

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

    @Get()
    getAll() {
        return this.accountsService.getAllAccounts();
    }

    @Get('tree')
    getTree() {
        return this.accountsService.getAccountsTree();
    }

    @Get(':id')
    getAccountById(@Param('id', ParseIntPipe) id: number) {
        return this.accountsService.getAccountById(id);
    }    
}