import { Controller, Post, Body, Req, UseGuards, Get, Query, Param, ParseIntPipe, Patch, Delete } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) { }

  @Post()
  @Permissions('expenses', 'canAdd')
  async createJournal(
    @Req() req,
    @Body() body: { expenses: { type: string; amount: number; description?: string; userId?: number }[] }
  ) {
    return this.expenseService.createExpenseJournal(
      req.user.id,
      body.expenses
    );
  }

  @Get(':page')
  @Permissions('expenses', 'canView')
  async getExpensesAccount(
    @Param('page', ParseIntPipe) page: number,
    @Query('limit') limit = 10,
  ) {
    return this.expenseService.getExpensesAccountData(page, +limit);
  }

  @Get('records/:page')
  @Permissions('expenses', 'canView')
  async getExpensesRecords(
    @Param('page', ParseIntPipe) page: number,
    @Query('limit') limit = 10,
  ) {
    return this.expenseService.getExpensesRecords(page, +limit);
  }

  @Patch(':journalId')
  @Permissions('expenses', 'canUpdate')
  async updateExpense(
    @Req() req,
    @Param('journalId', ParseIntPipe) journalId: number,
    @Body() body: { expenses: { type: string; amount: number; description?: string; userId?: number }[] },
  ) {
    return this.expenseService.updateExpense(
      req.user.id,
      journalId,
      body.expenses
    );
  }

  @Delete(':journalId')
  @Permissions('expenses', 'canDelete')
  async deleteExpense(
    @Req() req,
    @Param('journalId', ParseIntPipe) journalId: number,
  ) {
    return this.expenseService.deleteExpense(req.user.id, journalId);
  }

  @Get('users/list')
  @Permissions('expenses', 'canView')
  async getUsersForExpenses() {
    return this.expenseService.getUsersForExpenses();
  }
}