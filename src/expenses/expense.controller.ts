import { Controller, Post, Body, Req, UseGuards, Get, Query, Param, ParseIntPipe, Patch, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { JwtAuthGuard } from '../auth/strategy/jwt.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) { }

  @Post('upload-voucher')
  @Permissions('expenses', 'canAdd')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadVoucher(
    @Req() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.expenseService.uploadExpenseVoucher(req.user.id, file);
  }

  @Post()
  @Permissions('expenses', 'canAdd')
  async createJournal(
    @Req() req,
    @Body() body: { expenses: { type: string; amount: number; description?: string; userId?: number }[]; voucherUrl?: string; reference?: string }
  ) {
    return this.expenseService.createExpenseJournal(
      req.user.id,
      body.expenses,
      body.voucherUrl,
      body.reference
    );
  }

  @Get('next-voucher-number')
  @Permissions('expenses', 'canView')
  async getNextVoucherNumber() {
    return this.expenseService.getNextExpenseVoucherNumber();
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
    @Query('type') type?: string | string[],
    @Query('employeeId') employeeId?: string | string[],
  ) {
    const types = type
      ? (Array.isArray(type) ? type : typeof type === 'string' ? type.split(',').map((s) => s.trim()).filter(Boolean) : [])
      : undefined;
    const employeeIds = employeeId
      ? (Array.isArray(employeeId) ? employeeId : typeof employeeId === 'string' ? employeeId.split(',').map((s) => s.trim()) : [employeeId])
          .map((id) => parseInt(String(id), 10))
          .filter((id) => !isNaN(id))
      : undefined;
    return this.expenseService.getExpensesRecords(page, +limit, types, employeeIds);
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