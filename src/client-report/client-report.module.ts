import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientReportService } from './client-report.service';
import { ClientReportController } from './client-report.controller';

@Module({
    controllers: [ClientReportController],
    providers: [ClientReportService, PrismaService],
})
export class ClientReportModule { }
