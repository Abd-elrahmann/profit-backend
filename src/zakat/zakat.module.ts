import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZakatService } from './zakat.service';
import { ZakatController } from './zakat.controller';
import { ZakatSchedulerService } from './zakat.scheduler';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [ZakatController],
  providers: [ZakatService, PrismaService , ZakatSchedulerService],
})
export class ZakatModule {}
