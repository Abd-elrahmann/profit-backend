import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoansService } from './loans.service';
import { LoansConversionService } from './loanConversion.service';
import { LoansController } from './loans.controller';
import { JournalService } from '../journal/journal.service';
import { loansFilesService } from './loansFiles.service';

@Module({
  controllers: [LoansController],
  providers: [LoansService, PrismaService, JournalService, LoansConversionService , loansFilesService],
})
export class LoansModule { }
