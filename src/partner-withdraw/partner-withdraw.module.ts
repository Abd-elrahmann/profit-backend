import { Module } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { PartnerWithdrawController } from './partner-withdraw.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [PartnerWithdrawController],
  providers: [PartnerWithdrawService, PrismaService ],
})
export class PartnerWithdrawModule {}