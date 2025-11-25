import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { PartnersReportService } from './partners-report.service';
import { PartnersReportController } from './partners-report.controller';

@Module({
    controllers: [PartnersReportController],
    providers: [PartnersReportService, PrismaService],
})
export class PartnersReportModule { }