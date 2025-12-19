import { Module } from '@nestjs/common';
import { SmallLoanService } from './small-loan.service';
import { SmallLoanController } from './small-loan.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';

@Module({
    imports: [JournalModule],
    controllers: [SmallLoanController],
    providers: [SmallLoanService, PrismaService],
})
export class SmallLoanModule { }
