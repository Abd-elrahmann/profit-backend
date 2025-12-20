import { Module } from '@nestjs/common';
import { IncomeStatementService } from './income-statement.service';
import { IncomeStatementController } from './income-statement.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [IncomeStatementController],
    providers: [IncomeStatementService, PrismaService],
})
export class IncomeStatementModule { }
