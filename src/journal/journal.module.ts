import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { OpeningJournalService } from './opening-journal.service';
import { JournalController } from './journal.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LoansModule } from '../loans/loans.module';

@Module({
    imports: [LoansModule],
    controllers: [JournalController,],
    providers: [JournalService, OpeningJournalService, PrismaService],
    exports: [JournalService],
})
export class JournalModule { }
