import { Module } from '@nestjs/common';
import { ExpenseService } from './expense.service';
import { ExpenseController } from './expense.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Module({
    controllers: [ExpenseController],
    providers: [ExpenseService, PrismaService , JournalService],
})
export class ExpenseModule {}