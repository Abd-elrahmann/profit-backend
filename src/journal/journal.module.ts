import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { OpeningJournalService } from './opening-journal.service';
import { JournalController } from './journal.controller';
import { PrismaService } from '../prisma/prisma.service';
import { LoansModule } from '../loans/loans.module';
import { ZakatService } from 'src/zakat/zakat.service';

@Module({
    imports: [LoansModule],
    controllers: [JournalController,],
    providers: [JournalService, OpeningJournalService, PrismaService , ZakatService],
    exports: [JournalService],
})
export class JournalModule { }
