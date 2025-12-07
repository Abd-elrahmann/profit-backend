import { Controller, Post, Body, Req, UseGuards, Get, Query, Param, ParseIntPipe } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) { }

  @Post()
  // @Permissions('expenses', 'canAdd')
  async createJournal(
    @Req() req,
    @Body() body: { amount: number; description: string }
  ) {
    return this.expenseService.createExpenseJournal(
      req.user.id,
      body.amount,
      body.description
    );
  }

  @Get(':page')
  // @Permissions('expenses', 'canView')
  async getExpensesAccount(
    @Param('page', ParseIntPipe) page: number,
    @Query('limit') limit = 10,
  ) {
    return this.expenseService.getExpensesAccountData(page, +limit);
  }
}
