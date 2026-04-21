import { Module } from '@nestjs/common';
import { PartnerLossService } from './partner-loss.service';
import { PartnerLossController } from './partner-loss.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';

@Module({
   imports: [JournalModule],
  controllers: [PartnerLossController],
  providers: [PartnerLossService, PrismaService],
})
export class PartnerLossModule {}