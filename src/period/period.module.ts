import { Module } from '@nestjs/common';
import { PeriodService } from './period.service';
import { PeriodController } from './period.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Module({
  controllers: [PeriodController],
  providers: [PeriodService, PrismaService, JournalService],
})
export class PeriodModule {}