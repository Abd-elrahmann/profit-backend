import { Module } from '@nestjs/common';
import { ExternalInvestmentService } from './external-investment.service';
import { ExternalInvestmentController } from './external-investment.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Module({
    controllers: [ExternalInvestmentController],
    providers: [ExternalInvestmentService, PrismaService, JournalService],
})
export class ExternalInvestmentModule { }