import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { JournalService } from '../journal/journal.service';

@Module({
  controllers: [LoansController],
  providers: [LoansService, PrismaService, JournalService],
})
export class LoansModule {}
