import { Module } from '@nestjs/common';
import { PartnerWithdrawService } from './partner-withdraw.service';
import { PartnerWithdrawController } from './partner-withdraw.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalModule } from '../journal/journal.module';
import { PartnerWithdrawalScheduler } from './partner-withdraw.scheduler';

@Module({
  imports: [JournalModule],
  controllers: [PartnerWithdrawController],
  providers: [PartnerWithdrawService, PrismaService , PartnerWithdrawalScheduler],
})
export class PartnerWithdrawModule {}