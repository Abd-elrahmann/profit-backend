import { Module } from '@nestjs/common';
import { DistributionService } from './distribution.service';
import { DistributionController } from './distribution.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';

@Module({
    controllers: [DistributionController],
    providers: [DistributionService, PrismaService, JournalService],
})
export class DistributionModule { }