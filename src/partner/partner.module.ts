import { Module } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { PartnerController } from './partner.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [PartnerController],
  providers: [PartnerService, PrismaService],
})
export class PartnerModule {}
