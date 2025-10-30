import { Module } from '@nestjs/common';
import { RepaymentService } from './repayment.service';
import { RepaymentController } from './repayment.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Module({
    controllers: [RepaymentController],
    providers: [RepaymentService, PrismaService, JournalService],
})
export class RepaymentModule { }
