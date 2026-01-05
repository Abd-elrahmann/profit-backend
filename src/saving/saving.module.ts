import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { SavingService } from './saving.service';
import { SavingController } from './saving.controller';
import { JournalModule } from '../journal/journal.module';

@Module({
    imports: [JournalModule],
    providers: [SavingService, PrismaService, JournalService],
    controllers: [SavingController],
})
export class SavingModule { }