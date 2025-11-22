import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { SavingService } from './saving.service';
import { SavingController } from './saving.controller';

@Module({
    providers: [SavingService, PrismaService, JournalService],
    controllers: [SavingController],
})
export class SavingModule { }